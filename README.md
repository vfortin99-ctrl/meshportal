# MeshPortal

MeshPortal is a FastAPI-based web application designed for managing MeshCore companion radios. It provides a user-friendly interface for connecting to devices, managing channels, sending messages, and monitoring device statistics in real-time. Built locally in Ottawa, Canada, MeshPortal is a robust solution for radio communication enthusiasts and professionals alike.

## Features
- **Device Management**: Connect to MeshCore devices via Serial, TCP, or BLE.
- **Channel Configuration**: View and configure communication channels.
- **Messaging**: Send direct or channel-based messages with optional retries and signing.
- **Real-Time Updates**: Receive live updates via WebSocket for events like messages, advertisements, and acknowledgments.
- **Device Statistics**: Monitor core, radio, and packet statistics, as well as battery status.
- **Remote Commands**: Send commands to remote devices, such as reboot or advertise.

## Built With
- **FastAPI**: For building the backend API.
- **Pydantic**: For data validation and serialization.
- **Uvicorn**: For running the ASGI server.
- **Python**: The core programming language.

## Installation Instructions

### Prerequisites
- Python 3.9 or higher
- Git
- A MeshCore device (optional, for full functionality)

### Steps
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/vfortin99-ctrl/meshportal.git
   cd meshportal
   ```

2. **Set Up a Virtual Environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the Application**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8080
   ```

5. **Access the Application**:
   Open your browser and navigate to `http://localhost:8080`.

## How It Works
MeshPortal acts as a bridge between the user and MeshCore devices. It uses FastAPI to expose RESTful endpoints for managing devices, channels, and messages. WebSocket connections enable real-time communication, ensuring users are always up-to-date with the latest events. The application is modular, with separate components for handling connections, events, and device commands.

## About
MeshPortal was proudly built locally in Ottawa, Canada. It reflects the dedication and innovation of its developers, aiming to provide a seamless experience for managing MeshCore devices.