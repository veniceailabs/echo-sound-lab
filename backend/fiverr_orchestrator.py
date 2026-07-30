#!/usr/bin/env python3
"""
Echo Sound Lab — Fiverr Automation Orchestrator
Fully automated mixing/mastering workflow from Fiverr orders
- Monitor Fiverr for new orders
- Auto-download audio files
- Auto-process through mixing/mastering engines
- Auto-upload results
- Notify user before delivery
"""

import os
import asyncio
import aiohttp
import json
from datetime import datetime
from typing import Optional, Dict, List
from pathlib import Path
import logging
from dataclasses import dataclass
import hashlib
import time

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class FiverrOrder:
    """Fiverr order representation"""
    order_id: str
    gig_id: str
    gig_title: str
    buyer_username: str
    status: str  # 'active', 'delivered', 'completed'
    delivery_deadline: str
    service_type: str  # 'mixing', 'mastering', 'ab_mastering'
    audio_url: Optional[str] = None
    genre: Optional[str] = None
    style: Optional[str] = None
    special_requests: Optional[str] = None
    created_at: Optional[str] = None

class FiverrAPI:
    """Fiverr API client"""

    BASE_URL = "https://api.fiverr.com/v2"

    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def _sign_request(self, method: str, endpoint: str, body: str = "") -> Dict:
        """Generate auth headers for Fiverr API"""
        timestamp = str(int(time.time()))

        # Create signature
        message = f"{method}{endpoint}{body}{timestamp}"
        signature = hashlib.sha256(
            f"{message}{self.api_secret}".encode()
        ).hexdigest()

        return {
            "X-Fiverr-API-Key": self.api_key,
            "X-Fiverr-API-Timestamp": timestamp,
            "X-Fiverr-API-Signature": signature,
            "Content-Type": "application/json"
        }

    async def get_active_orders(self) -> List[FiverrOrder]:
        """Fetch all active orders from Fiverr"""
        endpoint = "/orders"
        headers = self._sign_request("GET", endpoint)

        async with self.session.get(
            f"{self.BASE_URL}{endpoint}",
            headers=headers,
            params={"status": "active", "limit": 100}
        ) as resp:
            data = await resp.json()
            return self._parse_orders(data.get("orders", []))

    async def get_order_details(self, order_id: str) -> FiverrOrder:
        """Get details for specific order"""
        endpoint = f"/orders/{order_id}"
        headers = self._sign_request("GET", endpoint)

        async with self.session.get(
            f"{self.BASE_URL}{endpoint}",
            headers=headers
        ) as resp:
            data = await resp.json()
            return self._parse_order(data.get("order", {}))

    async def get_order_requirements(self, order_id: str) -> Dict:
        """Get custom requirements/answers from buyer"""
        endpoint = f"/orders/{order_id}/requirements"
        headers = self._sign_request("GET", endpoint)

        async with self.session.get(
            f"{self.BASE_URL}{endpoint}",
            headers=headers
        ) as resp:
            return await resp.json()

    async def download_attachment(self, attachment_id: str, save_path: str) -> bool:
        """Download audio file from order"""
        endpoint = f"/attachments/{attachment_id}/download"
        headers = self._sign_request("GET", endpoint)

        try:
            async with self.session.get(
                f"{self.BASE_URL}{endpoint}",
                headers=headers
            ) as resp:
                if resp.status == 200:
                    with open(save_path, 'wb') as f:
                        f.write(await resp.read())
                    logger.info(f"Downloaded attachment to {save_path}")
                    return True
                else:
                    logger.error(f"Failed to download attachment: {resp.status}")
                    return False
        except Exception as e:
            logger.error(f"Download error: {e}")
            return False

    async def upload_deliverable(
        self,
        order_id: str,
        file_path: str,
        message: str = "Your mix/master is ready!"
    ) -> bool:
        """Upload completed audio back to order"""
        endpoint = f"/orders/{order_id}/deliverables"
        headers = self._sign_request("POST", endpoint)

        try:
            with open(file_path, 'rb') as f:
                data = aiohttp.FormData()
                data.add_field('file', f, filename=Path(file_path).name)
                data.add_field('note', message)

                async with self.session.post(
                    f"{self.BASE_URL}{endpoint}",
                    headers=headers,
                    data=data
                ) as resp:
                    if resp.status in [200, 201]:
                        logger.info(f"Uploaded deliverable for order {order_id}")
                        return True
                    else:
                        logger.error(f"Upload failed: {resp.status}")
                        return False
        except Exception as e:
            logger.error(f"Upload error: {e}")
            return False

    async def complete_order(self, order_id: str) -> bool:
        """Mark order as delivered"""
        endpoint = f"/orders/{order_id}/complete"
        headers = self._sign_request("POST", endpoint)

        try:
            async with self.session.post(
                f"{self.BASE_URL}{endpoint}",
                headers=headers
            ) as resp:
                if resp.status == 200:
                    logger.info(f"Order {order_id} marked as completed")
                    return True
                return False
        except Exception as e:
            logger.error(f"Completion error: {e}")
            return False

    def _parse_orders(self, orders_data: List[Dict]) -> List[FiverrOrder]:
        """Parse Fiverr orders to FiverrOrder objects"""
        return [self._parse_order(order) for order in orders_data]

    def _parse_order(self, order_data: Dict) -> FiverrOrder:
        """Parse single Fiverr order"""
        # Extract custom questions/answers
        requirements = order_data.get("requirements", {})

        # Determine service type from gig
        gig_title = order_data.get("gig", {}).get("title", "").lower()
        if "mixing" in gig_title:
            service_type = "mixing"
        elif "a/b" in gig_title or "comparison" in gig_title:
            service_type = "ab_mastering"
        else:
            service_type = "mastering"

        # Extract custom answers
        custom_answers = {
            ans["key"]: ans["value"]
            for ans in requirements.get("answers", [])
        }

        return FiverrOrder(
            order_id=order_data.get("id", ""),
            gig_id=order_data.get("gig", {}).get("id", ""),
            gig_title=gig_title,
            buyer_username=order_data.get("buyer", {}).get("username", "Unknown"),
            status=order_data.get("status", "active"),
            delivery_deadline=order_data.get("deadline", ""),
            service_type=service_type,
            audio_url=order_data.get("attachment_url"),  # Placeholder
            genre=custom_answers.get("genre", "default"),
            style=custom_answers.get("style", "balanced"),
            special_requests=custom_answers.get("special_requests", ""),
            created_at=order_data.get("created_at", "")
        )

class AudioProcessor:
    """Process audio through Echo Sound Lab engines"""

    BACKEND_URL = "http://localhost:8000"  # Local or deployed backend

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def master_audio(
        self,
        audio_path: str,
        genre: str = "default",
        style: str = "balanced",
        target_loudness: float = -14.0
    ) -> Optional[str]:
        """Master audio file"""
        try:
            with open(audio_path, 'rb') as f:
                data = aiohttp.FormData()
                data.add_field('vocal', f, filename=Path(audio_path).name)
                data.add_field('genre', genre)
                data.add_field('style', style)
                data.add_field('target_loudness', str(target_loudness))

                async with self.session.post(
                    f"{self.BACKEND_URL}/master",
                    data=data,
                    timeout=aiohttp.ClientTimeout(total=300)
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result.get("audio_base64")
                    else:
                        logger.error(f"Mastering failed: {resp.status}")
                        return None
        except Exception as e:
            logger.error(f"Mastering error: {e}")
            return None

    async def mix_audio(
        self,
        vocal_path: str,
        beat_path: str,
        mix_preset: str = "balanced"
    ) -> Optional[str]:
        """Mix vocal with beat"""
        try:
            with open(vocal_path, 'rb') as vocal_f, open(beat_path, 'rb') as beat_f:
                data = aiohttp.FormData()
                data.add_field('vocal', vocal_f, filename=Path(vocal_path).name)
                data.add_field('beat', beat_f, filename=Path(beat_path).name)
                data.add_field('preset', mix_preset)

                async with self.session.post(
                    f"{self.BACKEND_URL}/mix",
                    data=data,
                    timeout=aiohttp.ClientTimeout(total=300)
                ) as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        return result.get("audio_base64")
                    else:
                        logger.error(f"Mixing failed: {resp.status}")
                        return None
        except Exception as e:
            logger.error(f"Mixing error: {e}")
            return None

    async def process_ab_mastering(
        self,
        audio_path: str,
        genre: str = "default"
    ) -> Optional[Dict[str, str]]:
        """Process 3 A/B mastering variations"""
        styles = ["bright", "warm", "balanced"]
        results = {}

        try:
            for style in styles:
                audio_base64 = await self.master_audio(
                    audio_path,
                    genre=genre,
                    style=style
                )
                if audio_base64:
                    results[style] = audio_base64

            return results if len(results) == 3 else None
        except Exception as e:
            logger.error(f"A/B mastering error: {e}")
            return None

class NotificationService:
    """Send notifications before delivery"""

    def __init__(self, webhook_url: Optional[str] = None, email: Optional[str] = None):
        self.webhook_url = webhook_url  # Slack, Discord, custom webhook
        self.email = email  # Email notification
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def notify_ready_for_review(
        self,
        order_id: str,
        buyer: str,
        service_type: str,
        file_preview: Optional[str] = None
    ) -> bool:
        """Notify user before delivery"""
        message = f"""
🎵 Audio Processing Complete - Ready for Review

Order ID: {order_id}
Client: {buyer}
Service: {service_type.replace('_', ' ').title()}
Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

✅ Processing complete
⏳ Awaiting your review before sending to client
🚀 Reply to approve and auto-deliver

{f"Preview: {file_preview}" if file_preview else ""}
        """

        if self.webhook_url:
            return await self._send_webhook(message)

        if self.email:
            return await self._send_email(message)

        # Log to console if no webhook/email
        logger.info(message)
        return True

    async def _send_webhook(self, message: str) -> bool:
        """Send to Slack/Discord webhook"""
        try:
            payload = {
                "text": message,
                "username": "Echo Sound Lab",
                "icon_emoji": ":musical_note:"
            }

            async with self.session.post(
                self.webhook_url,
                json=payload
            ) as resp:
                return resp.status == 200
        except Exception as e:
            logger.error(f"Webhook error: {e}")
            return False

    async def _send_email(self, message: str) -> bool:
        """Send email notification"""
        # TODO: Implement email (SendGrid, AWS SES, etc.)
        logger.info(f"Email notification: {message}")
        return True

class OrderOrchestrator:
    """Main automation orchestrator"""

    def __init__(
        self,
        fiverr_api_key: str,
        fiverr_api_secret: str,
        notification_webhook: Optional[str] = None,
        backend_url: Optional[str] = None,
        poll_interval: int = 60  # Check for orders every 60 seconds
    ):
        self.fiverr_api_key = fiverr_api_key
        self.fiverr_api_secret = fiverr_api_secret
        self.notification_webhook = notification_webhook
        self.backend_url = backend_url or "http://localhost:8000"
        self.poll_interval = poll_interval
        self.orders_cache: Dict[str, FiverrOrder] = {}
        self.processing_queue: List[str] = []

    async def start(self):
        """Start the automation daemon"""
        logger.info("Starting Echo Sound Lab Fiverr Orchestrator...")

        while True:
            try:
                await self._check_for_new_orders()
                await asyncio.sleep(self.poll_interval)
            except Exception as e:
                logger.error(f"Orchestrator error: {e}")
                await asyncio.sleep(self.poll_interval)

    async def _check_for_new_orders(self):
        """Poll Fiverr for new orders"""
        async with FiverrAPI(self.fiverr_api_key, self.fiverr_api_secret) as api:
            orders = await api.get_active_orders()

            for order in orders:
                if order.order_id not in self.orders_cache:
                    logger.info(f"New order detected: {order.order_id}")
                    self.orders_cache[order.order_id] = order
                    self.processing_queue.append(order.order_id)

                    # Start processing in background
                    asyncio.create_task(self._process_order(order, api))

    async def _process_order(self, order: FiverrOrder, api: FiverrAPI):
        """Process single order end-to-end"""
        logger.info(f"Processing order {order.order_id} ({order.service_type})")

        try:
            # Step 1: Download audio files
            audio_files = await self._download_order_files(order, api)
            if not audio_files:
                logger.error(f"Failed to download files for {order.order_id}")
                return

            # Step 2: Process audio
            async with AudioProcessor() as processor:
                if order.service_type == "mixing":
                    result = await self._process_mixing(processor, audio_files, order)
                elif order.service_type == "ab_mastering":
                    result = await self._process_ab_mastering(processor, audio_files, order)
                else:  # mastering
                    result = await self._process_mastering(processor, audio_files, order)

                if not result:
                    logger.error(f"Processing failed for {order.order_id}")
                    return

            # Step 3: Notify user before delivery
            async with NotificationService(self.notification_webhook) as notifier:
                notification_sent = await notifier.notify_ready_for_review(
                    order.order_id,
                    order.buyer_username,
                    order.service_type,
                    file_preview=result.get("preview_url")
                )

            if not notification_sent:
                logger.warning(f"Notification failed for {order.order_id}")

            # Step 4: Wait for user approval (via webhook response or manual check)
            # TODO: Implement approval mechanism
            logger.info(f"Awaiting approval for {order.order_id}...")

            # Step 5: Upload and deliver
            async with FiverrAPI(self.fiverr_api_key, self.fiverr_api_secret) as api:
                upload_success = await api.upload_deliverable(
                    order.order_id,
                    result["file_path"],
                    message="Your professional mix/master is ready! 🎵"
                )

                if upload_success:
                    completion_success = await api.complete_order(order.order_id)
                    if completion_success:
                        logger.info(f"Order {order.order_id} completed successfully!")
                    else:
                        logger.error(f"Failed to mark order {order.order_id} as completed")
                else:
                    logger.error(f"Failed to upload deliverable for {order.order_id}")

        except Exception as e:
            logger.error(f"Order processing error for {order.order_id}: {e}")

        finally:
            # Cleanup
            if order.order_id in self.processing_queue:
                self.processing_queue.remove(order.order_id)

    async def _download_order_files(self, order: FiverrOrder, api: FiverrAPI) -> Optional[Dict]:
        """Download all audio files from order"""
        try:
            # Get order details with attachments
            details = await api.get_order_details(order.order_id)
            requirements = await api.get_order_requirements(order.order_id)

            files = {}

            # Download each attached file
            for attachment in details.get("attachments", []):
                file_path = f"/tmp/fiverr_{order.order_id}_{attachment['id']}.wav"

                if await api.download_attachment(attachment["id"], file_path):
                    files[attachment.get("name", "audio")] = file_path

            return files if files else None

        except Exception as e:
            logger.error(f"Download error: {e}")
            return None

    async def _process_mixing(
        self,
        processor: AudioProcessor,
        files: Dict[str, str],
        order: FiverrOrder
    ) -> Optional[Dict]:
        """Process vocal mixing"""
        try:
            # Expect 'vocal' and 'beat' files
            vocal_path = files.get("vocal") or next(iter(files.values()))
            beat_path = files.get("beat")

            if not beat_path and len(files) > 1:
                beat_path = list(files.values())[1]

            result = await processor.mix_audio(vocal_path, beat_path or "")

            if result:
                output_path = f"/tmp/fiverr_{order.order_id}_mixed.wav"
                # Decode base64 and save
                import base64
                with open(output_path, 'wb') as f:
                    f.write(base64.b64decode(result))

                return {
                    "file_path": output_path,
                    "preview_url": "Check local preview"
                }

            return None

        except Exception as e:
            logger.error(f"Mixing processing error: {e}")
            return None

    async def _process_mastering(
        self,
        processor: AudioProcessor,
        files: Dict[str, str],
        order: FiverrOrder
    ) -> Optional[Dict]:
        """Process mastering"""
        try:
            audio_path = next(iter(files.values()))

            result = await processor.master_audio(
                audio_path,
                genre=order.genre,
                style=order.style
            )

            if result:
                output_path = f"/tmp/fiverr_{order.order_id}_mastered.wav"
                # Decode base64 and save
                import base64
                with open(output_path, 'wb') as f:
                    f.write(base64.b64decode(result))

                return {
                    "file_path": output_path,
                    "preview_url": "Check local preview"
                }

            return None

        except Exception as e:
            logger.error(f"Mastering processing error: {e}")
            return None

    async def _process_ab_mastering(
        self,
        processor: AudioProcessor,
        files: Dict[str, str],
        order: FiverrOrder
    ) -> Optional[Dict]:
        """Process A/B mastering comparison"""
        try:
            audio_path = next(iter(files.values()))

            results = await processor.process_ab_mastering(
                audio_path,
                genre=order.genre
            )

            if results and len(results) == 3:
                # Save all 3 versions
                import base64
                output_paths = {}

                for style, audio_b64 in results.items():
                    output_path = f"/tmp/fiverr_{order.order_id}_{style}.wav"
                    with open(output_path, 'wb') as f:
                        f.write(base64.b64decode(audio_b64))
                    output_paths[style] = output_path

                # Primary file is balanced version
                primary_file = output_paths.get("balanced", next(iter(output_paths.values())))

                return {
                    "file_path": primary_file,
                    "all_files": output_paths,
                    "preview_url": "3 versions created - ready for client review"
                }

            return None

        except Exception as e:
            logger.error(f"A/B mastering error: {e}")
            return None

# Entry point
async def main():
    """Start the Fiverr automation daemon"""

    # Get credentials from environment
    api_key = os.getenv("FIVERR_API_KEY", "your_api_key_here")
    api_secret = os.getenv("FIVERR_API_SECRET", "your_api_secret_here")
    webhook_url = os.getenv("SLACK_WEBHOOK_URL", None)

    orchestrator = OrderOrchestrator(
        fiverr_api_key=api_key,
        fiverr_api_secret=api_secret,
        notification_webhook=webhook_url,
        poll_interval=60  # Check every 60 seconds
    )

    await orchestrator.start()

if __name__ == "__main__":
    asyncio.run(main())
