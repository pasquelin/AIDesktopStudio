from aidesktopstudio_engine.hardware.probe import hardware_info


def test_answers_the_machine_without_a_tensor_library() -> None:
    reading = hardware_info()

    assert reading["platform"] and reading["machine"] and reading["pythonVersion"]
    assert reading["cpuCount"] >= 1


def test_writes_an_unread_total_as_unread_rather_than_as_a_number() -> None:
    total = hardware_info()["totalBytes"]

    assert total is None or total > 0
