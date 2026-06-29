"""WebSocket manager for real-time dashboard updates."""
import asyncio
import json
from datetime import datetime
from typing import Set

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections and broadcasts updates."""

    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._broadcast_task: asyncio.Task | None = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self._connections.discard(websocket)

    async def broadcast(self, message: dict):
        """Send a message to all connected clients."""
        dead = []
        data = json.dumps(message, default=str)
        for ws in self._connections:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.discard(ws)

    @property
    def active_connections(self) -> int:
        return len(self._connections)

    async def broadcast_event(self, event_type: str, data: dict | None = None):
        """Broadcast a typed event to all clients."""
        await self.broadcast({
            "type": event_type,
            "data": data or {},
            "ts": datetime.utcnow().isoformat(),
        })


manager = ConnectionManager()
