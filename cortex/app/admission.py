import asyncio
from dataclasses import dataclass
from enum import IntEnum
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")


class Priority(IntEnum):
    P0 = 0
    P1 = 1
    P2 = 2
    P3 = 3
    P4 = 4


@dataclass(frozen=True)
class AdmissionItem:
    priority: Priority
    sequence: int
    work: Callable[[], Awaitable[T]]
    future: asyncio.Future[T]


class AdmissionController:
    """Bounded priority scheduler. Lower numeric priority is more important."""

    def __init__(self, concurrency: int, queue_sizes: dict[Priority, int]):
        self._queues = {
            p: asyncio.PriorityQueue(maxsize=queue_sizes[p]) for p in Priority
        }
        self._concurrency = concurrency
        self._semaphore = asyncio.Semaphore(concurrency)
        self._sequence = 0
        self._closed = False
        self._workers: list[asyncio.Task[None]] = []

    async def start(self, workers: int | None = None) -> None:
        count = workers or self._concurrency
        self._workers = [asyncio.create_task(self._worker()) for _ in range(count)]

    async def submit(self, priority: Priority, work: Callable[[], Awaitable[T]]) -> T:
        if self._closed:
            raise RuntimeError("admission controller is closed")
        loop = asyncio.get_running_loop()
        future: asyncio.Future[T] = loop.create_future()
        self._sequence += 1
        item = AdmissionItem(priority, self._sequence, work, future)
        queue = self._queues[priority]
        if queue.full():
            raise RuntimeError(f"priority queue {priority.name} saturated")
        await queue.put((item.priority, item.sequence, item))
        return await future

    async def _next(self) -> AdmissionItem:
        while not self._closed:
            for priority in Priority:
                queue = self._queues[priority]
                if not queue.empty():
                    _, _, item = await queue.get()
                    return item
            await asyncio.sleep(0.002)
        raise asyncio.CancelledError

    async def _worker(self) -> None:
        while not self._closed:
            try:
                item = await self._next()
                async with self._semaphore:
                    try:
                        result = await item.work()
                    except Exception as exc:
                        if not item.future.done():
                            item.future.set_exception(exc)
                    else:
                        if not item.future.done():
                            item.future.set_result(result)
            except asyncio.CancelledError:
                return

    async def close(self) -> None:
        self._closed = True
        for task in self._workers:
            task.cancel()
        if self._workers:
            await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
