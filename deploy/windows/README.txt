GraphMind Windows portable package
=================================

Requirements
- Windows 10/11
- Python 3.11 or newer, with "Add python.exe to PATH" enabled
  https://www.python.org/downloads/windows/

Start
1. Unzip this folder.
2. Double-click start-graphmind.bat
   or run start-graphmind.ps1 in PowerShell.
3. The first launch creates .venv and installs dependencies.
4. The browser opens http://127.0.0.1:8000/

Data
- Local workspace files are stored in the workspace\ folder next to the launcher.
- Stop the app with Ctrl+C in the console window.

Notes
- Keep frontend-dist\ and backend\ next to the start scripts.
- This package is intended for a single-user local Windows machine.
