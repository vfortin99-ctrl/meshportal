#!/bin/bash

# MeshPortal Installation Script for macOS 🚀
# Author: ItsMeVino

set -e  # Exit immediately if a command exits with a non-zero status

# Welcome message
echo "Welcome to the MeshPortal installer for macOS! 👋"
echo "This script will set up everything you need to run MeshPortal."

# Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "Homebrew is not installed. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo "Homebrew installation complete."
fi

# Install prerequisites
echo "Installing prerequisites..."
brew install python3 git

# Clone the repository
echo "Cloning the MeshPortal repository..."
git clone https://github.com/vfortin99-ctrl/meshportal.git
cd meshportal

# Set up a virtual environment
echo "Setting up a Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt
pip install meshcore  # Ensure the MeshCore library is installed
pip install "uvicorn[standard]"  # Install WebSocket support for Uvicorn

# Run the application
echo "Starting MeshPortal..."
uvicorn main:app --host 0.0.0.0 --port 8080

# Done
echo "MeshPortal is now running! 🎉 Open your browser and go to http://localhost:8080"
