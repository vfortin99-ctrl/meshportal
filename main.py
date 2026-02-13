"""
MeshPortal - Main FastAPI Application
"""

import asyncio
import json
import logging
import time as time_module
from typing import Optional, Dict, Any, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from meshcore import MeshCore, SerialConnection, TCPConnection, BLEConnection, EventType

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def sanitize_for_json(obj):
    """Convert bytes and other non-JSON-serializable objects to strings"""
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, bytes):
        return obj.hex()
    elif isinstance(obj, (int, float, str, bool, type(None))):
        return obj
    else:
        return str(obj)


# Global state
class AppState:
    mc: Optional[MeshCore] = None
    websockets: List[WebSocket] = []
    subscriptions: List[Any] = []

state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("MeshPortal starting...")
    yield
    # Cleanup on shutdown
    if state.mc:
        try:
            await state.mc.disconnect()
        except:
            pass
    logger.info("MeshPortal stopped")


app = FastAPI(
    title="MeshPortal",
    description="MeshPortal - Web application for MeshCore companion radio management",
    version="1.0.0",
    lifespan=lifespan
)

# Mount static files
import os
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


# ============== Pydantic Models ==============

class ConnectionRequest(BaseModel):
    type: str  # "serial", "tcp", "ble"
    port: Optional[str] = None
    baudrate: Optional[int] = 115200
    host: Optional[str] = None
    tcp_port: Optional[int] = 5000
    password: Optional[str] = None
    device_name: Optional[str] = None
    pin: Optional[str] = None

class SendMessageRequest(BaseModel):
    recipient: str  # public key
    text: str
    channel_idx: Optional[int] = None
    signed: bool = False
    retries: int = 0

class ChannelConfig(BaseModel):
    channel_idx: int
    name: str
    secret: Optional[str] = None

class DeviceSettingsRequest(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    tx_power: Optional[int] = None
    is_repeater: Optional[bool] = None


# ============== Helper Functions ==============

async def broadcast_event(event_type: str, payload: Dict[str, Any]):
    """Broadcast an event to all connected WebSocket clients"""
    message = json.dumps({
        "type": event_type,
        "payload": payload
    }, default=str)
    
    disconnected = []
    for ws in state.websockets:
        try:
            await ws.send_text(message)
        except:
            disconnected.append(ws)
    
    # Remove disconnected clients
    for ws in disconnected:
        if ws in state.websockets:
            state.websockets.remove(ws)


def setup_event_handlers():
    """Set up event handlers for the MeshCore instance"""
    if not state.mc:
        return
    
    async def on_contact_message(event):
        await broadcast_event("contact_message", event.payload)
    
    async def on_channel_message(event):
        await broadcast_event("channel_message", event.payload)
    
    async def on_ack(event):
        await broadcast_event("ack", event.payload)
    
    async def on_advertisement(event):
        await broadcast_event("advertisement", event.payload)
    
    async def on_contacts(event):
        await broadcast_event("contacts_updated", {})
    
    state.subscriptions.append(state.mc.subscribe(EventType.CONTACT_MSG_RECV, on_contact_message))
    state.subscriptions.append(state.mc.subscribe(EventType.CHANNEL_MSG_RECV, on_channel_message))
    state.subscriptions.append(state.mc.subscribe(EventType.ACK, on_ack))
    state.subscriptions.append(state.mc.subscribe(EventType.ADVERTISEMENT, on_advertisement))
    state.subscriptions.append(state.mc.subscribe(EventType.CONTACTS, on_contacts))


def cleanup_subscriptions():
    """Clean up event subscriptions"""
    if state.mc:
        for sub in state.subscriptions:
            try:
                state.mc.unsubscribe(sub)
            except:
                pass
    state.subscriptions.clear()


# ============== Routes ==============

@app.get("/")
async def index():
    """Serve the main page"""
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "MeshPortal API", "docs": "/docs"}


@app.get("/api/status")
async def get_status():
    """Get current connection status"""
    if state.mc and state.mc.is_connected:
        return {
            "connected": True,
            "self_info": state.mc.self_info,
            "time": state.mc.time
        }
    return {"connected": False}


@app.post("/api/connect")
async def connect(request: ConnectionRequest):
    """Connect to a MeshCore device"""
    if state.mc and state.mc.is_connected:
        raise HTTPException(status_code=400, detail="Already connected")
    
    try:
        if request.type == "serial":
            if not request.port:
                raise HTTPException(status_code=400, detail="Port required for serial connection")
            connection = SerialConnection(request.port, request.baudrate)
        
        elif request.type == "tcp":
            if not request.host:
                raise HTTPException(status_code=400, detail="Host required for TCP connection")
            connection = TCPConnection(request.host, request.tcp_port, request.password)
        
        elif request.type == "ble":
            if not request.device_name:
                raise HTTPException(status_code=400, detail="Device name required for BLE connection")
            connection = BLEConnection(request.device_name, request.pin)
        
        else:
            raise HTTPException(status_code=400, detail=f"Unknown connection type: {request.type}")
        
        state.mc = MeshCore(connection)
        await state.mc.connect()
        
        # Sync time to device immediately
        current_time = int(time_module.time())
        time_result = await state.mc.commands.set_time(current_time)
        logger.info(f"Synced device time to {current_time}, result: {time_result.type}")
        
        # Verify by reading back
        await state.mc.commands.get_time()
        logger.info(f"Device time after sync: {state.mc.time}")
        
        # Load initial data
        await state.mc.ensure_contacts(follow=True)
        
        # Set up event handlers
        setup_event_handlers()
        
        # Start auto message fetching to receive incoming messages
        await state.mc.start_auto_message_fetching()
        logger.info("Auto message fetching started")
        
        await broadcast_event("connected", {"self_info": state.mc.self_info})
        
        return {
            "success": True,
            "self_info": state.mc.self_info
        }
    
    except Exception as e:
        logger.error(f"Connection failed: {e}")
        state.mc = None
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/disconnect")
async def disconnect():
    """Disconnect from the device"""
    if not state.mc:
        return {"success": True, "message": "Not connected"}
    
    try:
        cleanup_subscriptions()
        # Stop auto message fetching
        try:
            await state.mc.stop_auto_message_fetching()
        except:
            pass
        await state.mc.disconnect()
        state.mc = None
        await broadcast_event("disconnected", {})
        return {"success": True}
    except Exception as e:
        logger.error(f"Disconnect failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/contacts")
async def get_contacts():
    """Get all contacts"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    await state.mc.ensure_contacts(follow=True)
    
    contacts = []
    for key, contact in state.mc.contacts.items():
        contacts.append({
            "public_key": key,
            **contact
        })
    
    return {"contacts": contacts}


@app.get("/api/channels")
async def get_channels():
    """Get all channels"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        channels = []
        for i in range(8):
            result = await state.mc.commands.get_channel(i)
            if result.type == EventType.CHANNEL_INFO:
                payload = sanitize_for_json(result.payload)
                channels.append({
                    "channel_idx": i,
                    **payload
                })
        
        return {"channels": channels}
    except Exception as e:
        logger.error(f"Get channels failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/channels")
async def set_channel(config: ChannelConfig):
    """Set a channel configuration"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        result = await state.mc.commands.set_channel(
            config.channel_idx,
            config.name,
            config.secret
        )
        return {"success": result.type == EventType.OK}
    except Exception as e:
        logger.error(f"Set channel failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/device")
async def get_device_info():
    """Get device information"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        # Refresh device info
        device_result = await state.mc.commands.send_device_query()
        device_info = device_result.payload if device_result.type == EventType.DEVICE_INFO else None
        
        # Fetch actual device time
        time_result = await state.mc.commands.get_time()
        device_time = state.mc.time  # Updated by event handler
        
        return {
            "self_info": state.mc.self_info,
            "time": device_time,
            "device_info": device_info
        }
    except Exception as e:
        logger.error(f"Get device info failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats")
async def get_stats():
    """Get device statistics"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        stats = {}
        
        # Get core stats
        try:
            result = await state.mc.commands.get_stats_core()
            if result.type == EventType.STATS_CORE:
                stats["core"] = result.payload
        except:
            pass
        
        # Get radio stats
        try:
            result = await state.mc.commands.get_stats_radio()
            if result.type == EventType.STATS_RADIO:
                stats["radio"] = result.payload
        except:
            pass
        
        # Get packet stats
        try:
            result = await state.mc.commands.get_stats_packets()
            if result.type == EventType.STATS_PACKETS:
                stats["packets"] = result.payload
        except:
            pass
        
        # Get battery
        try:
            result = await state.mc.commands.get_bat()
            if result.type == EventType.BATTERY:
                stats["battery"] = result.payload
        except:
            pass
        
        return stats
    except Exception as e:
        logger.error(f"Get stats failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/send")
async def send_message(request: SendMessageRequest):
    """Send a message"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        # Get current timestamp for messages
        current_time = int(time_module.time())
        
        if request.channel_idx is not None:
            # Channel message
            result = await state.mc.commands.send_chan_msg(
                request.channel_idx,
                request.text,
                timestamp=current_time,
                signed=True
            )
        else:
            # Direct message to contact
            contact = state.mc.contacts.get(request.recipient)
            if not contact:
                raise HTTPException(status_code=404, detail="Contact not found")
            
            if request.retries > 0:
                result = await state.mc.commands.send_msg_with_retry(
                    contact,
                    request.text,
                    timestamp=current_time,
                    max_attempts=request.retries,
                    signed=True
                )
            else:
                result = await state.mc.commands.send_msg(
                    contact,
                    request.text,
                    timestamp=current_time,
                    signed=True
                )
        
        # Get expected_ack from result and convert bytes to hex if needed
        expected_ack = ""
        if result is None:
            raise HTTPException(status_code=500, detail="Message send timed out - no ACK received")
        if result.type == EventType.ERROR:
            error_msg = result.payload.get("error_code", "Unknown error") if result.payload else "Unknown error"
            raise HTTPException(status_code=500, detail=f"Failed to send message: error_code {error_msg}")
        if result.payload:
            ack = result.payload.get("expected_ack", "")
            if isinstance(ack, bytes):
                expected_ack = ack.hex()
            elif ack:
                expected_ack = str(ack)
        
        return {
            "success": True,
            "expected_ack": expected_ack
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Send message failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/device/settings")
async def update_device_settings(settings: DeviceSettingsRequest):
    """Update device settings"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        results = {}
        
        if settings.name is not None:
            result = await state.mc.commands.set_name(settings.name)
            results["name"] = result.type == EventType.OK
        
        if settings.lat is not None and settings.lon is not None:
            result = await state.mc.commands.set_coords(settings.lat, settings.lon)
            results["coords"] = result.type == EventType.OK
        
        if settings.tx_power is not None:
            result = await state.mc.commands.set_tx_power(settings.tx_power)
            results["tx_power"] = result.type == EventType.OK
        
        if settings.is_repeater is not None:
            result = await state.mc.commands.set_repeater(settings.is_repeater)
            results["is_repeater"] = result.type == EventType.OK
        
        return {"success": True, "results": results}
    except Exception as e:
        logger.error(f"Update settings failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SetTimeRequest(BaseModel):
    timestamp: int


@app.post("/api/device/time")
async def set_device_time(request: SetTimeRequest):
    """Set the device time"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        result = await state.mc.commands.set_time(request.timestamp)
        success = result.type == EventType.OK
        
        # Fetch updated time to confirm
        if success:
            await state.mc.commands.get_time()
        
        return {"success": success, "time": state.mc.time}
    except Exception as e:
        logger.error(f"Set time failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/serial/ports")
async def list_serial_ports():
    """List available serial ports"""
    try:
        import serial.tools.list_ports
        ports = [
            {
                "device": port.device,
                "description": port.description,
                "hwid": port.hwid
            }
            for port in serial.tools.list_ports.comports()
        ]
        return {"ports": ports}
    except Exception as e:
        logger.error(f"List ports failed: {e}")
        return {"ports": []}


# ============== Remote Management ==============

class RemoteCommandRequest(BaseModel):
    target: str
    command: str


class ResetPathRequest(BaseModel):
    public_key: str


@app.post("/api/remote/command")
async def send_remote_command(request: RemoteCommandRequest):
    """Send a remote command to a repeater or room"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        contact = state.mc.contacts.get(request.target)
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        if request.command == "reboot":
            result = await state.mc.commands.send_cmd(contact, "reboot")
        elif request.command == "advert":
            result = await state.mc.commands.send_cmd(contact, "advert")
        else:
            raise HTTPException(status_code=400, detail=f"Unknown command: {request.command}")
        
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Remote command failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/contacts/reset-path")
async def reset_contact_path(request: ResetPathRequest):
    """Reset the path to a contact"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        result = await state.mc.commands.reset_path(request.public_key)
        return {"success": result.type == EventType.OK}
    except Exception as e:
        logger.error(f"Reset path failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/contacts/{public_key}/telemetry")
async def get_contact_telemetry(public_key: str):
    """Get telemetry for a remote contact"""
    if not state.mc:
        raise HTTPException(status_code=400, detail="Not connected")
    
    try:
        contact = state.mc.contacts.get(public_key)
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        
        # Request telemetry from the contact
        result = await state.mc.commands.get_telemetry(contact)
        
        if result.type == EventType.TELEMETRY_RESPONSE:
            payload = result.payload
            return {
                "battery": payload.get("battery", -1),
                "temperature": payload.get("temp", payload.get("temperature")),
                "humidity": payload.get("humidity"),
                "pressure": payload.get("pressure"),
                "voltage": payload.get("voltage")
            }
        
        return {"battery": -1}
    except Exception as e:
        logger.error(f"Get telemetry failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== WebSocket ==============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time events"""
    await websocket.accept()
    state.websockets.append(websocket)
    
    logger.info(f"WebSocket client connected. Total: {len(state.websockets)}")
    
    # Send current status
    if state.mc and state.mc.is_connected:
        await websocket.send_text(json.dumps({
            "type": "status",
            "payload": {
                "connected": True,
                "self_info": state.mc.self_info
            }
        }, default=str))
    else:
        await websocket.send_text(json.dumps({
            "type": "status",
            "payload": {"connected": False}
        }))
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                # Handle client messages if needed
                msg_type = message.get("type")
                
                if msg_type == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                
            except json.JSONDecodeError:
                pass
    
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in state.websockets:
            state.websockets.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(state.websockets)}")


# ============== Run ==============

def run():
    """Run the application"""
    import uvicorn
    uvicorn.run(
        "meshportal.main:app",
        host="0.0.0.0",
        port=8080,
        reload=True
    )


if __name__ == "__main__":
    run()
