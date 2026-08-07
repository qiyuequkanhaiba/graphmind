import {
  buildGraphLayout,
  serializeGraphLayout,
  type GraphLayoutWorkerRequest,
  type GraphLayoutWorkerResponse
} from "./graphLayout";

self.onmessage = (event: MessageEvent<GraphLayoutWorkerRequest>) => {
  const { graph, layoutPreset } = event.data;
  const response: GraphLayoutWorkerResponse = {
    layoutPreset,
    positions: serializeGraphLayout(buildGraphLayout(graph, layoutPreset))
  };
  self.postMessage(response);
};

export {};
