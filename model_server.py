from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from transformers import BartForConditionalGeneration, BartTokenizer

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_PATH = "./final_model"
print("Loading BART model...")
tokenizer = BartTokenizer.from_pretrained(MODEL_PATH)
model = BartForConditionalGeneration.from_pretrained(MODEL_PATH)
print("✅ BART model loaded!")

def generate(text: str, level: str, max_length: int = 128) -> str:
    prefixed = f"{level}: {text}"
    inputs = tokenizer(prefixed, return_tensors="pt", max_length=max_length, truncation=True)
    outputs = model.generate(inputs["input_ids"], max_length=max_length, num_beams=4, early_stopping=True)
    return tokenizer.decode(outputs[0], skip_special_tokens=True)

class ProblemRequest(BaseModel):
    text: str

@app.post("/generate")
def generate_levels(req: ProblemRequest):
    return {
        "original":  req.text,
        "simplify":  generate(req.text, "simplify"),
        "cognate":   generate(req.text, "cognate"),
        "translate": generate(req.text, "translate"),
    }

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
