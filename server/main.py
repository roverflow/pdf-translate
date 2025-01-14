from celery.result import AsyncResult
from fastapi import Body, FastAPI, Form, Request
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from fastapi.middleware.cors import CORSMiddleware

import json

from fastapi import FastAPI, UploadFile, Form, HTTPException
from fastapi.responses import FileResponse

from worker import create_task, translate_task, celery

import io
import os




class TranslationArgs(BaseModel):
    lang_in: str
    lang_out: str
    service: str
    thread: int

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins. Replace with specific domains if needed.
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],  # Allow all headers
)


@app.get("/")
def home(request: Request):
    return templates.TemplateResponse("home.html", context={"request": request})


@app.post("/tasks", status_code=201)
def run_task(payload = Body(...)):
    task_type = payload["type"]
    task = create_task.delay(int(task_type))
    return JSONResponse({"task_id": task.id})


@app.get("/tasks/{task_id}")
def get_status(task_id):
    task_result = AsyncResult(task_id)
    result = {
        "task_id": task_id,
        "task_status": task_result.status,
        "task_result": task_result.result
    }
    return JSONResponse(result)


@app.post("/v1/translate")
async def create_translate_tasks(file: UploadFile, data: str = Form(...)):
    try:
        stream = await file.read()
        fileName = file.filename
        args = json.loads(data)
        out_lang = args.get("lang_out", "translated")
        translated_file_path = os.path.join("static", fileName, f"{fileName}-{out_lang}.pdf")
        
        # Check if the translation is already done
        if os.path.exists(translated_file_path):
            return {"done": True}
        
        task = translate_task.delay(stream, args, fileName)
        return {"id": task.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/v1/translate/{id}")
async def get_translate_task(id: str):
    result = AsyncResult(id, app=celery)
    if result.state == "PROGRESS":
        return {"state": result.state, "info": result.info}
    if result.ready():
        return {"state": result.state, "info": result.info, "ready": "ready"}
    return {"state": result.state}

@app.get("/v1/translate/{id}/{format}")
async def get_translate_result(id: str, format: str):
    result = AsyncResult(id, app=celery)
    if not result.ready():
        raise HTTPException(status_code=400, detail="Task not finished")
    if not result.successful():
        raise HTTPException(status_code=400, detail="Task failed")
    doc_mono, doc_dual = result.get()
    
    to_send = doc_mono if format == "mono" else doc_dual
    byte_io = io.BytesIO(to_send)
    with open("file_path.pdf", "wb") as f:
        f.write(byte_io.getbuffer())

    # return FileResponse(io.BytesIO(to_send), media_type="application/pdf")
    return {"state": result.state, "info": result.info}

@app.get("/download/{file_name}")
async def download_file(file_name: str):
    # Assuming files are stored in a directory named 'static' with subdirectories named after the file
    file_dir = os.path.join("static", file_name)
    file_path = os.path.join(file_dir, f"{file_name}.pdf")
    
    # Check if the file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Return the file for download
    return FileResponse(file_path, media_type="application/pdf", filename=f"{file_name}.pdf")
