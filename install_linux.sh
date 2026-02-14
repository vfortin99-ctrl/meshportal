#!/bin/bash

# MeshPortal Installation Script for Linux (Ubuntu, etc.) 🚀
# Author: ItsMeVino

set -e  # Exit immediately if a command exits with a non-zero status

# Welcome message
echo "Welcome to the MeshPortal installer for Linux! 👋"
echo "This script will set up everything you need to run MeshPortal."

# Update and install prerequisites
echo "Updating package lists and installing prerequisites..."
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git

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
pip install meshcore  # Install the MeshCore library

# Run the application
echo "Starting MeshPortal..."
uvicorn main:app --host 0.0.0.0 --port 8080

# Done
echo "MeshPortal is now running! 🎉 Open your browser and go to http://localhost:8080"
