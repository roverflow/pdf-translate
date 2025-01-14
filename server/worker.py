import os
import time
import tqdm
import io

from pdf2zh import translate

from celery import Celery, Task




celery = Celery(__name__)
celery.conf.broker_url = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379")
celery.conf.result_backend = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379")


class FastTask(Task):
    def __call__(self, *args, **kwargs):
        return self.run(*args, **kwargs)


celery.Task = FastTask

@celery.task(name="create_task")
def create_task(task_type):
    time.sleep(int(task_type) * 10)
    return True

@celery.task(name="translate_task")
def translate_task(stream: bytes, args: dict, file_name: str):
    orig_dir = os.path.join("static", file_name)
    os.makedirs(orig_dir, exist_ok=True)
    orig_file_path = os.path.join(orig_dir, f"{file_name}.pdf")
    out_lang = args.get("lang_out", "translated")
    translated_file_path = os.path.join(orig_dir, f"{file_name}-{out_lang}.pdf")

    try:
        bytes_io = io.BytesIO(stream)
        with open(orig_file_path, "wb") as f:
            f.write(bytes_io.getbuffer())
    except Exception as e:
        print(e)
        return False

    try:
        doc_mono, doc_dual = translate(
            files=[orig_file_path],
            **args,
        )
        with open(translated_file_path, "wb") as f:
            f.write(doc_dual)
        return doc_mono, doc_dual
    except Exception as e:
        print(e)
        return False
