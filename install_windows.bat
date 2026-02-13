@echo off

REM MeshPortal Installation Script for Windows 🚀
REM Author: ItsMeVino

REM Welcome message
echo Welcome to the MeshPortal installer for Windows! 👋
echo This script will set up everything you need to run MeshPortal.

REM Check for Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python is not installed. Please install Python 3.9 or higher and try again.
    exit /b 1
)

REM Check for Git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Git is not installed. Please install Git and try again.
    exit /b 1
)

REM Clone the repository
echo Cloning the MeshPortal repository...
git clone https://github.com/vfortin99-ctrl/meshportal.git
cd meshportal

REM Set up a virtual environment
echo Setting up a Python virtual environment...
python -m venv venv
call venv\Scripts\activate

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Run the application
echo Starting MeshPortal...
uvicorn main:app --host 0.0.0.0 --port 8080

REM Done
echo MeshPortal is now running! 🎉 Open your browser and go to http://localhost:8080