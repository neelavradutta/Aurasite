import uvicorn
from config.settings import settings

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=settings.port, reload=settings.fastapi_env == "development")
