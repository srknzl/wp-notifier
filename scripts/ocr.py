"""
Extract all text blocks and coordinates from an image as JSON using RapidOCR (ONNX).
Usage: python scripts/ocr.py <image_path>
"""
import sys
import json

# Ensure stdout uses UTF-8 regardless of Windows console/locale codepage (e.g. cp1254)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from rapidocr_onnxruntime import RapidOCR

def main():
    if len(sys.argv) < 2:
        print(json.dumps([]))
        return
    
    image_path = sys.argv[1]
    engine = RapidOCR()
    result, _ = engine(image_path)
    
    output = []
    if result:
        for box, text, score in result:
            output.append({
                "box": box,
                "text": text,
                "score": float(score) if score is not None else 0.0
            })
            
    print(json.dumps(output, ensure_ascii=False))

if __name__ == '__main__':
    main()
