"""
RapidOCR (ONNX) kullanarak görseldeki tüm metin bloklarını ve koordinatlarını JSON olarak döndürür.
Kullanım: python scripts/ocr.py <resim_dosyasi>
"""
import sys
import json
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

