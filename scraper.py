"""Metadata scraping from Google Books, Open Library, and GoodReads."""
import re
import time
import logging
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


# ---------------------------------------------------------------------------
# Google Books
# ---------------------------------------------------------------------------

def search_google_books(query: str, max_results: int = 10) -> list[dict]:
    """Search Google Books API."""
    url = "https://www.googleapis.com/books/v1/volumes"
    params = {"q": query, "maxResults": max_results, "printType": "books"}
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        return [_parse_google_volume(item) for item in data.get("items", [])]
    except Exception as exc:
        logger.warning("Google Books search failed: %s", exc)
        return []


def fetch_google_books_by_isbn(isbn: str) -> dict | None:
    results = search_google_books(f"isbn:{isbn}", max_results=1)
    return results[0] if results else None


def _parse_google_volume(item: dict) -> dict:
    info = item.get("volumeInfo", {})
    isbns = {i["type"]: i["identifier"] for i in info.get("industryIdentifiers", [])}
    image = info.get("imageLinks", {})
    cover_url = image.get("extraLarge") or image.get("large") or image.get("thumbnail")
    if cover_url:
        cover_url = cover_url.replace("http://", "https://")
    return {
        "source": "google_books",
        "google_books_id": item.get("id"),
        "title": info.get("title"),
        "author": ", ".join(info.get("authors", [])),
        "publisher": info.get("publisher"),
        "published_date": info.get("publishedDate"),
        "description": info.get("description"),
        "page_count": info.get("pageCount"),
        "categories": ", ".join(info.get("categories", [])),
        "language": info.get("language"),
        "isbn": isbns.get("ISBN_10"),
        "isbn13": isbns.get("ISBN_13"),
        "rating": info.get("averageRating"),
        "cover_url": cover_url,
    }


# ---------------------------------------------------------------------------
# Open Library
# ---------------------------------------------------------------------------

def search_open_library(query: str, max_results: int = 10) -> list[dict]:
    """Search Open Library."""
    url = "https://openlibrary.org/search.json"
    params = {"q": query, "limit": max_results, "fields": "key,title,author_name,isbn,publisher,first_publish_year,language,number_of_pages_median,subject,cover_i,ratings_average"}
    try:
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        return [_parse_ol_doc(doc) for doc in data.get("docs", [])]
    except Exception as exc:
        logger.warning("Open Library search failed: %s", exc)
        return []


def fetch_open_library_by_isbn(isbn: str) -> dict | None:
    results = search_open_library(f"isbn:{isbn}", max_results=1)
    return results[0] if results else None


def _parse_ol_doc(doc: dict) -> dict:
    cover_id = doc.get("cover_i")
    cover_url = f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg" if cover_id else None
    isbns = doc.get("isbn", [])
    isbn10 = next((i for i in isbns if len(i) == 10), None)
    isbn13 = next((i for i in isbns if len(i) == 13), None)
    return {
        "source": "open_library",
        "title": doc.get("title"),
        "author": ", ".join(doc.get("author_name", [])),
        "publisher": ", ".join(doc.get("publisher", [])[:2]),
        "published_date": str(doc.get("first_publish_year", "")),
        "description": None,
        "page_count": doc.get("number_of_pages_median"),
        "categories": ", ".join((doc.get("subject") or [])[:5]),
        "language": ", ".join(doc.get("language", [])),
        "isbn": isbn10,
        "isbn13": isbn13,
        "rating": doc.get("ratings_average"),
        "cover_url": cover_url,
    }


# ---------------------------------------------------------------------------
# GoodReads (scrape)
# ---------------------------------------------------------------------------

def search_goodreads(query: str, max_results: int = 10) -> list[dict]:
    """Search GoodReads (scrape)."""
    url = "https://www.goodreads.com/search/index.xml"
    # GoodReads deprecated their API; fall back to web scrape
    url = f"https://www.goodreads.com/search?q={requests.utils.quote(query)}&search_type=books"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")
        results = []
        for row in soup.select("tr[itemtype='http://schema.org/Book']")[:max_results]:
            results.append(_parse_gr_row(row))
        return [r for r in results if r]
    except Exception as exc:
        logger.warning("GoodReads search failed: %s", exc)
        return []


def fetch_goodreads_book(book_id: str) -> dict | None:
    """Fetch full details for a GoodReads book."""
    url = f"https://www.goodreads.com/book/show/{book_id}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        r.raise_for_status()
        return _parse_gr_book_page(r.text, book_id)
    except Exception as exc:
        logger.warning("GoodReads fetch failed: %s", exc)
        return None


def _parse_gr_row(row) -> dict | None:
    try:
        title_el = row.select_one("a.bookTitle span")
        author_el = row.select_one("a.authorName span")
        cover_el = row.select_one("img")
        link_el = row.select_one("a.bookTitle")
        gr_id = None
        if link_el and link_el.get("href"):
            m = re.search(r"/show/(\d+)", link_el["href"])
            gr_id = m.group(1) if m else None
        cover_url = None
        if cover_el:
            src = cover_el.get("src", "")
            cover_url = re.sub(r"\._\w+_\.jpg", ".jpg", src)
        return {
            "source": "goodreads",
            "goodreads_id": gr_id,
            "title": title_el.text.strip() if title_el else None,
            "author": author_el.text.strip() if author_el else None,
            "cover_url": cover_url,
            "publisher": None,
            "published_date": None,
            "description": None,
            "page_count": None,
            "categories": None,
            "language": None,
            "isbn": None,
            "isbn13": None,
            "rating": None,
        }
    except Exception:
        return None


def _parse_gr_book_page(html: str, book_id: str) -> dict:
    soup = BeautifulSoup(html, "lxml")

    def txt(sel):
        el = soup.select_one(sel)
        return el.get_text(strip=True) if el else None

    title = txt("h1[data-testid='bookTitle']") or txt("h1.Text__title1")
    author = txt("span.ContributorLink__name")
    description_el = soup.select_one("div[data-testid='description'] span.Formatted")
    description = description_el.get_text(strip=True) if description_el else None
    cover_el = soup.select_one("img.ResponsiveImage")
    cover_url = cover_el["src"] if cover_el and cover_el.get("src") else None
    rating_el = soup.select_one("div.RatingStatistics__rating")
    rating = None
    if rating_el:
        try:
            rating = float(rating_el.text.strip())
        except ValueError:
            pass
    pages_el = soup.select_one("p[data-testid='pagesFormat']")
    page_count = None
    if pages_el:
        m = re.search(r"(\d+)\s+pages", pages_el.text)
        page_count = int(m.group(1)) if m else None
    genre_els = soup.select("span.BookPageMetadataSection__genreButton a")
    categories = ", ".join(el.text.strip() for el in genre_els[:5]) if genre_els else None
    isbn_el = soup.select_one("div[itemprop='isbn']")
    isbn13_val = isbn_el.text.strip() if isbn_el else None

    return {
        "source": "goodreads",
        "goodreads_id": book_id,
        "title": title,
        "author": author,
        "cover_url": cover_url,
        "publisher": None,
        "published_date": None,
        "description": description,
        "page_count": page_count,
        "categories": categories,
        "language": None,
        "isbn": None,
        "isbn13": isbn13_val,
        "rating": rating,
    }


# ---------------------------------------------------------------------------
# Amazon (scrape)
# ---------------------------------------------------------------------------

def search_amazon(query: str) -> list[dict]:
    """Search Amazon for book metadata (best-effort scrape)."""
    url = f"https://www.amazon.com/s?k={requests.utils.quote(query)}&i=stripbooks"
    try:
        r = requests.get(url, headers=HEADERS, timeout=12)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")
        results = []
        for item in soup.select("div[data-component-type='s-search-result']")[:10]:
            result = _parse_amazon_item(item)
            if result:
                results.append(result)
        return results
    except Exception as exc:
        logger.warning("Amazon search failed: %s", exc)
        return []


def _parse_amazon_item(item) -> dict | None:
    try:
        title_el = item.select_one("h2 a span")
        title = title_el.text.strip() if title_el else None
        author_el = item.select_one("div.a-row.a-size-base.a-color-secondary a")
        author = author_el.text.strip() if author_el else None
        cover_el = item.select_one("img.s-image")
        cover_url = cover_el["src"] if cover_el else None
        asin_el = item.get("data-asin")
        return {
            "source": "amazon",
            "title": title,
            "author": author,
            "cover_url": cover_url,
            "asin": asin_el,
            "publisher": None,
            "published_date": None,
            "description": None,
            "page_count": None,
            "categories": None,
            "language": None,
            "isbn": None,
            "isbn13": None,
            "rating": None,
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Unified search
# ---------------------------------------------------------------------------

def search_all_sources(query: str) -> dict:
    """Search all available metadata sources."""
    google = search_google_books(query)
    open_lib = search_open_library(query)
    goodreads = search_goodreads(query)
    return {
        "google_books": google,
        "open_library": open_lib,
        "goodreads": goodreads,
    }


def fetch_cover_image(url: str) -> bytes | None:
    """Download a cover image from a URL."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=15, stream=True)
        r.raise_for_status()
        return r.content
    except Exception as exc:
        logger.warning("Cover download failed from %s: %s", url, exc)
        return None
