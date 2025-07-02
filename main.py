from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import logging # Logging kütüphanesini kullanmak için
from pathlib import Path
from dotenv import load_dotenv
from pydantic import BaseModel
import httpx # HTTP istekleri için
from typing import Optional, Annotated

# Logging seviyesini DEBUG olarak ayarlayalım, böylece daha fazla bilgi görebiliriz
logging.basicConfig(level=logging.INFO) # Geliştirme aşamasında INFO veya DEBUG olabilir
                                        # Üretimde WARNING veya ERROR yapabilirsiniz

# Serper API veya Google Custom Search API için gerekli
# .env dosyanızda SERPER_API_KEY veya Google Search_API_KEY ve GOOGLE_CSE_ID olmalı
load_dotenv()
SERPER_API_KEY = os.getenv("SERPER_API_KEY")

# SERPER_API_KEY'in başarıyla yüklenip yüklenmediğini kontrol etmek için ek log
if SERPER_API_KEY:
    logging.info("SERPER_API_KEY başarıyla yüklendi.")
else:
    logging.warning("SERPER_API_KEY bulunamadı veya boş. Lütfen .env dosyanızı kontrol edin.")

class AnalyzeRequest(BaseModel):
    platform: str
    user_input: str
    input_type: Optional[str] = None


app = FastAPI(title="DevMapAPI")

# CORS ayarları
origins = [
    "https://developermap.vercel.app/",
    "http://localhost:8080",  # Lokal development sunucusu (FastAPI'nin kendisi)
    "http://127.0.0.1:8080",  # Lokal development sunucusu (FastAPI'nin kendisi)
    "http://localhost:5500",  # Live Server (VS Code) için
    "http://127.0.0.1:5500",  # Live Server (VS Code) için
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to DevMap API"}

async def search_github_username_via_google(query: str) -> str | None:
    """
    Google (Serper API üzerinden) arama yaparak GitHub kullanıcı adını bulmaya çalışır.
    """
    if not SERPER_API_KEY:
        logging.warning("SERPER_API_KEY bulunamadı. Google araması yapılamayacak.")
        return None

    search_query = f"{query} site:github.com"
    url = "https://google.serper.dev/search"
    headers = {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
    }
    payload = json.dumps({
        "q": search_query, # Sorguyu yukarıda tanımladık
        "gl": "tr", # Coğrafi Bölge 
        "hl": "tr", # Dil 
        "type": "search", # Arama tipi
        })


    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, headers=headers, content=payload, timeout=10.0)

            # --- BURADA DEĞİŞİKLİK YAPTIK ---
            # Yanıtın durum kodunu ve içeriğini raise_for_status() öncesinde logla
            logging.info(f"Serper API yanıt durumu: {response.status_code}")
            logging.info(f"Serper API yanıt URL: {response.request.url}") # İsteğin atıldığı URL'i de görelim
            logging.info(f"Serper API yanıt başlıkları: {response.headers}") # Yanıt başlıklarını görelim
            logging.info(f"Serper API yanıt içeriği (text): {response.text}") # Ham yanıt içeriği
            try:
                logging.info(f"Serper API yanıt içeriği (json): {response.json()}") # JSON olarak parse edebiliyorsa
            except json.JSONDecodeError:
                logging.info("Serper API yanıtı JSON olarak parse edilemedi.")
            # ----------------------------------

            response.raise_for_status() # Raises an exception for 4xx/5xx responses
            search_results = response.json()

            # "organic" sonuçlarda "github.com" içeren bir link arayın
            if "organic" in search_results:
                for result in search_results["organic"]:
                    if "link" in result and "github.com/" in result["link"]:
                        # GitHub linkinden kullanıcı adını çıkarmaya çalışın
                        path_parts = result["link"].split('/')
                        if len(path_parts) >= 4 and path_parts[2] == "github.com":
                            username = path_parts[3]
                            # Bazı genel GitHub sayfalarını veya özel durumları filtrele
                            if username and not username.startswith("features") and not username.startswith("topics"):
                                logging.info(f"Google araması ile bulunan GitHub kullanıcı adı: {username}")
                                return username
            return None # GitHub kullanıcı adı bulunamadı

        except httpx.HTTPStatusError as e:
            # Hata durumunda da yanıt içeriğini loglayalım
            logging.error(f"Serper API HTTP hatası: {e.response.status_code} - {e.response.text}")
            return None
        except httpx.RequestError as e:
            logging.error(f"Serper API isteği hatası: {str(e)}")
            return None
        except Exception as e:
            logging.error(f"Serper API işleme hatası: {str(e)}")
            return None

async def is_probable_github_username(userinput: str) -> Optional[str | bool]:
    """
    Eğer userinput bir GitHub linki değilse ve '/' içermiyorsa,
    Google üzerinden GitHub kullanıcı adı araması yapar.

    Dönüş:
    - Kullanıcı adı (str) -> aramayla bulunduysa
    - False -> Bulunamadıysa
    - None -> Zaten bir GitHub linkiyse
    """
    userinput_lower = userinput.lower()
    if "github.com" not in userinput_lower and "/" not in userinput:
        found_username = await search_github_username_via_google(userinput)
        if found_username:
            return found_username
        else:
            logging.warning(f"Google araması '{userinput}' için GitHub kullanıcı adı bulamadı.")
            return False
    return None  # zaten link veya geçersiz

def extract_username(userinput: str, expected_domain: str) -> str:
    """
    Verilen platform URL'sinden kullanıcı adını çıkarır.
    Örnek:
    - https://github.com/cihanayindi => 'cihanayindi'
    - https://www.kaggle.com/cihanayindi => 'cihanayindi'
    
    Args:
        userinput: Kullanıcıdan gelen URL (str)
        expected_domain: Beklenen platform domaini (örn: 'github.com', 'kaggle.com')

    Returns:
        username (str)

    Raises:
        HTTPException (400): Geçersiz link veya kullanıcı adı çıkarılamadıysa
    """
    try:
        url_obj = httpx.URL(userinput.strip())

        host = url_obj.host.lower()
        if host != expected_domain and not host.endswith(f".{expected_domain}"):
            raise ValueError(f"Sadece '{expected_domain}' domaini destekleniyor. Girilen: {host}")

        parts = url_obj.path.strip("/").split("/")
        if len(parts) >= 1 and parts[0]:
            username = parts[0]
            logging.info(f"{expected_domain} linkinden çıkarılan kullanıcı adı: {username}")
            return username
        else:
            raise ValueError(f"{expected_domain} linkinden kullanıcı adı çıkarılamadı.")
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz {expected_domain} linki: {str(e)}")
    
async def send_request_to_githubapi(username: str):
    try:
        # GitHub API'den kullanıcı verilerini çek
        async with httpx.AsyncClient() as client:
            user_response = await client.get(f"https://api.github.com/users/{username}")
            user_response.raise_for_status()
            user_data = user_response.json()

            repos_response = await client.get(f"https://api.github.com/users/{username}/repos?per_page=100")
            repos_response.raise_for_status()
            repos_data = repos_response.json()

        languages = {}
        for repo in repos_data:
            if repo.get("language"):
                languages[repo["language"]] = languages.get(repo["language"], 0) + 1

        total_stars = sum(repo.get("stargazers_count", 0) for repo in repos_data)

        analyzed_data = {
            "platform": "github",
            "username": username,
            "avatar_url": user_data.get("avatar_url"),
            "name": user_data.get("name") or user_data.get("login"),
            "login": user_data.get("login"),
            "bio": user_data.get("bio") or 'Kullanıcı bir biyografi belirtmemiş.',
            "html_url": user_data.get("html_url"),
            "public_repos": user_data.get("public_repos"),
            "followers": user_data.get("followers"),
            "following": user_data.get("following"),
            "total_stars": total_stars,
            "languages": languages
        }
        return analyzed_data

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail=f"GitHub kullanıcısı '{username}' bulunamadı.")
        raise HTTPException(status_code=500, detail=f"GitHub API hatası: {e.response.status_code} - {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analiz sırasında bir hata oluştu: {str(e)}")        



@app.post("/api/analyze")
async def analyze_profile(request: AnalyzeRequest):
    """
    Verilen bilgilere göre bir geliştirici profilini analiz eder.
    """
    platform = request.platform.lower()
    user_input = request.user_input
    input_type = request.input_type

    if platform == "github":
        github_username = None

        # 1. Girdi tipi "direct_username" ise aramayı atla
        #    (Frontend bir linkten kullanıcı adını çıkardığında bunu gönderecek)
        if input_type == "direct_username":
            logging.info(f"İstek tipi 'direct_username'. Arama atlanıyor. Kullanıcı adı: {user_input}")
            github_username = user_input
        # 2. Girdi bir link ise, kullanıcı adını çıkar
        elif "github.com" in user_input.lower():
            github_username = extract_username(user_input, "github.com")
        # 3. Diğer durumlarda (ad-soyad vb.), Google araması yap
        else:
            found_username = await search_github_username_via_google(user_input)
            if found_username:
                github_username = found_username
            else:
                # Arama başarısız olursa, girdinin kendisini dene
                logging.warning(f"Google araması '{user_input}' için sonuç bulamadı. Girdinin kendisi deneniyor.")
                github_username = user_input

        if not github_username:
            raise HTTPException(status_code=400, detail="Geçerli bir GitHub kullanıcı adı belirlenemedi.")

        return await send_request_to_githubapi(github_username)

    elif platform == "kaggle":
        raise HTTPException(status_code=501, detail="Kaggle desteği henüz yok.")
    else:
        raise HTTPException(status_code=400, detail="Desteklenmeyen platform.")