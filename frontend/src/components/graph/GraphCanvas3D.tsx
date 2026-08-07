import { useEffect, useMemo, useRef } from "react";
import { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import { BufferGeometry } from "three/src/core/BufferGeometry.js";
import { SphereGeometry } from "three/src/geometries/SphereGeometry.js";
import { AmbientLight } from "three/src/lights/AmbientLight.js";
import { PointLight } from "three/src/lights/PointLight.js";
import { LineBasicMaterial } from "three/src/materials/LineBasicMaterial.js";
import { MeshStandardMaterial } from "three/src/materials/MeshStandardMaterial.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { Group } from "three/src/objects/Group.js";
import { Line } from "three/src/objects/Line.js";
import { Mesh } from "three/src/objects/Mesh.js";
import { WebGLRenderer } from "three/src/renderers/WebGLRenderer.js";
import { Scene } from "three/src/scenes/Scene.js";
import type { GraphNodeType, GraphResponse } from "../../api/types";
import type { Language } from "../../i18n/messages";
import { getRelationshipStrength } from "./graphSemantics";

type Props = {
  graph: GraphResponse;
  language: Language;
};

export default function GraphCanvas3D({ graph, language }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stats = useMemo(() => getGraph3DStats(graph), [graph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) {
      return undefined;
    }
    if (navigator.userAgent.toLowerCase().includes("jsdom")) {
      return undefined;
    }

    const context =
      canvas.getContext("webgl2", { alpha: true, antialias: true }) ??
      canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!context) {
      return undefined;
    }
    const renderer = new WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      context
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 1, 1, 4000);
    camera.position.set(0, 0, 780);

    const root = new Group();
    scene.add(root);
    scene.add(new AmbientLight(0x9fb6d8, 1.5));
    const pointLight = new PointLight(0x24d3b5, 3, 1600);
    pointLight.position.set(180, -180, 420);
    scene.add(pointLight);

    const positions = build3DNodePositions(graph);
    const nodeMaterialByType: Record<GraphNodeType, MeshStandardMaterial> = {
      code_symbol: new MeshStandardMaterial({ color: 0x9f7bff, emissive: 0x1d123c, roughness: 0.43 }),
      derived_entity: new MeshStandardMaterial({ color: 0xf2b84b, emissive: 0x281700, roughness: 0.44 }),
      document: new MeshStandardMaterial({ color: 0x8aa0b8, emissive: 0x121b25, roughness: 0.48 }),
      entity: new MeshStandardMaterial({ color: 0xff8d6b, emissive: 0x2a120c, roughness: 0.45 }),
      field: new MeshStandardMaterial({ color: 0x24d3b5, emissive: 0x082d26, roughness: 0.42 }),
      table: new MeshStandardMaterial({ color: 0x5ba7ff, emissive: 0x071c34, roughness: 0.4 })
    };
    const ownedMaterials = new Set<{ dispose: () => void }>(Object.values(nodeMaterialByType));

    for (const node of graph.nodes) {
      const position = positions.get(node.id) ?? new Vector3();
      const radius = node.node_type === "table" ? 17 : node.node_type === "field" ? 11 : 14;
      const mesh = new Mesh(
        new SphereGeometry(radius, 24, 18),
        nodeMaterialByType[node.node_type]
      );
      mesh.position.copy(position);
      root.add(mesh);
    }

    for (const edge of graph.edges) {
      const sourcePosition = positions.get(edge.source_node_id);
      const targetPosition = positions.get(edge.target_node_id);
      if (!sourcePosition || !targetPosition) {
        continue;
      }
      const material = new LineBasicMaterial({
        color: relationship3DColor(edge),
        opacity: edge.edge_type === "contains_field" ? 0.42 : 0.82,
        transparent: true
      });
      ownedMaterials.add(material);
      const geometry = new BufferGeometry().setFromPoints([sourcePosition, targetPosition]);
      root.add(new Line(geometry, material));
    }

    const resize = () => {
      const { height, width } = parent.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      renderer.setSize(nextWidth, nextHeight, false);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    };

    const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let shouldReduceMotion = reducedMotionQuery?.matches ?? false;
    let isPageVisible = document.visibilityState !== "hidden";
    let isInViewport = true;
    let frame = 0;
    let animationFrame: number | null = null;

    const renderFrame = () => {
      if (shouldReduceMotion) {
        root.rotation.set(0, 0, 0);
      } else {
        frame += 1;
        root.rotation.y = frame * 0.003;
        root.rotation.x = Math.sin(frame * 0.006) * 0.14;
      }
      renderer.render(scene, camera);
    };

    const stopAnimation = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const render = () => {
      animationFrame = null;
      if (shouldReduceMotion || !isPageVisible || !isInViewport) {
        return;
      }
      frame += 1;
      root.rotation.y = frame * 0.003;
      root.rotation.x = Math.sin(frame * 0.006) * 0.14;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };

    const syncAnimation = () => {
      stopAnimation();
      if (!isPageVisible || !isInViewport) {
        return;
      }
      if (shouldReduceMotion) {
        renderFrame();
        return;
      }
      animationFrame = window.requestAnimationFrame(render);
    };

    const handleVisibilityChange = () => {
      isPageVisible = document.visibilityState !== "hidden";
      syncAnimation();
    };
    const handleReducedMotionChange = () => {
      shouldReduceMotion = reducedMotionQuery?.matches ?? false;
      syncAnimation();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(parent);
    const intersectionObserver =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            isInViewport = entries.some((entry) => entry.isIntersecting);
            syncAnimation();
          })
        : null;
    intersectionObserver?.observe(canvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    reducedMotionQuery?.addEventListener("change", handleReducedMotionChange);
    resize();
    renderFrame();
    syncAnimation();

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery?.removeEventListener("change", handleReducedMotionChange);
      root.traverse((child) => {
        if ("geometry" in child) {
          const geometry = child.geometry;
          if (geometry instanceof BufferGeometry) {
            geometry.dispose();
          }
        }
      });
      for (const material of ownedMaterials) {
        material.dispose();
      }
      scene.clear();
      renderer.dispose();
    };
  }, [graph]);

  return (
    <section aria-label={language === "en-US" ? "Experimental 3D graph view" : "3D 图谱实验视图"} className="graph-3d-view">
      <canvas aria-label={language === "en-US" ? "3D graph canvas" : "3D 图谱画布"} ref={canvasRef} />
      <div className="graph-3d-hud">
        <span>{language === "en-US" ? "3D exploration" : "3D 探索"}</span>
        <strong>{language === "en-US" ? `${stats.nodeCount} nodes` : `${stats.nodeCount} 个节点`}</strong>
        <strong>{language === "en-US" ? `${stats.edgeCount} relationships` : `${stats.edgeCount} 条关系`}</strong>
        <strong>{language === "en-US" ? `${stats.strongCount} strong` : `强关系 ${stats.strongCount}`}</strong>
      </div>
    </section>
  );
}

function build3DNodePositions(graph: GraphResponse): Map<number, Vector3> {
  const positions = new Map<number, Vector3>();
  const radius = Math.max(130, graph.nodes.length * 20);
  graph.nodes.forEach((node, index) => {
    const layerOffset =
      node.node_type === "table" || node.node_type === "document"
        ? -110
        : node.node_type === "field"
          ? 0
          : 110;
    const angle = graph.nodes.length === 0 ? 0 : (index / graph.nodes.length) * Math.PI * 2;
    positions.set(
      node.id,
      new Vector3(Math.cos(angle) * radius, layerOffset, Math.sin(angle) * radius)
    );
  });
  return positions;
}

function relationship3DColor(edge: GraphResponse["edges"][number]): number {
  if (edge.edge_type === "foreign_key") {
    return 0x5ba7ff;
  }
  if (edge.edge_type === "derived_dimension") {
    return 0xf2b84b;
  }
  if (getRelationshipStrength(edge) === "strong") {
    return 0x24d3b5;
  }
  return 0x71809a;
}

function getGraph3DStats(graph: GraphResponse) {
  return {
    edgeCount: graph.edges.length,
    nodeCount: graph.nodes.length,
    strongCount: graph.edges.filter((edge) => getRelationshipStrength(edge) === "strong").length
  };
}
