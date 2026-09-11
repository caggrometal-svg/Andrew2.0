import asyncio

import pytest

from app.admission import AdmissionItem, Priority


@pytest.mark.asyncio
async def test_all_priorities_are_ordered(admission_controller):
    loop = asyncio.get_running_loop()
    items = []
    for priority in reversed(list(Priority)):
        future = loop.create_future()
        item = AdmissionItem(priority, len(items), lambda: asyncio.sleep(0), future)
        items.append(item)
        await admission_controller._queues[priority].put((priority, item.sequence, item))

    for expected in Priority:
        selected = await admission_controller._next()
        assert selected.priority is expected
    await admission_controller.close()


@pytest.mark.asyncio
async def test_saturation_is_rejected(admission_controller):
    async def work():
        return "ok"

    task = asyncio.create_task(admission_controller.submit(Priority.P0, work))
    await asyncio.sleep(0)
    second = asyncio.create_task(admission_controller.submit(Priority.P0, work))
    await asyncio.sleep(0)
    with pytest.raises(RuntimeError, match="saturated"):
        await admission_controller.submit(Priority.P0, work)
    await admission_controller.close()
    for pending in (task, second):
        if not pending.done():
            pending.cancel()
    await asyncio.gather(task, second, return_exceptions=True)


@pytest.mark.asyncio
async def test_worker_executes_success_and_propagates_failure(admission_controller):
    await admission_controller.start(workers=1)

    async def ok():
        return "done"

    async def bad():
        raise ValueError("boom")

    assert await admission_controller.submit(Priority.P1, ok) == "done"
    with pytest.raises(ValueError, match="boom"):
        await admission_controller.submit(Priority.P1, bad)
    await admission_controller.close()
