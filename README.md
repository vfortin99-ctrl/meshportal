# MeshPortal 🚀

Hey there! 👋 I'm ItsMeVino, and I built MeshPortal right here in Ottawa, Canada! 🇨🇦 This is a super cool FastAPI web app for managing MeshCore companion radios. Whether you're into radio communication or just love tinkering with tech, this app is for you! 😄

## What MeshPortal Does
- **Manage Devices**: Easily connect to MeshCore devices via Serial, TCP, or BLE.
- **Configure Channels**: View and tweak communication channels to your liking.
- **Send Messages**: Chat directly or through channels, with retries and signing options.
- **Real-Time Updates**: Stay in the loop with live WebSocket updates for messages, ads, and more.
- **Monitor Stats**: Check out device stats like battery, radio, and packets.
- **Remote Commands**: Send commands like reboot or advertise to remote devices.

## Built With ❤️
- **FastAPI**: The backbone of the app.
- **Pydantic**: For making sure data behaves.
- **Uvicorn**: To run the show.
- **Python**: Because Python is awesome.

## How to Get Started 🛠️

### What You Need:
- Python 3.9 or higher
- Git
- A MeshCore device (optional, but more fun!)

### Steps:
1. **Clone the Repo**:
   ```bash
   git clone https://github.com/vfortin99-ctrl/meshportal.git
   cd meshportal
   ```

2. **Set Up a Virtual Environment**:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\\Scripts\\activate
   ```

3. **Install the Goodies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the App**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8080
   ```

5. **Open Your Browser**:
   Go to `http://localhost:8080` and enjoy! 🎉

## How It Works 🤔
MeshPortal is like your personal assistant for MeshCore devices. It uses FastAPI to create a bunch of endpoints for managing devices, channels, and messages. WebSockets keep everything real-time, so you're always up-to-date. It's modular, clean, and just plain fun to use!

## A Little About Me
I'm ItsMeVino, and I love building cool stuff like this! MeshPortal was a labor of love, built locally in Ottawa, Canada. I hope you enjoy using it as much as I enjoyed making it. If you have any questions or just want to say hi, feel free to reach out! 😊