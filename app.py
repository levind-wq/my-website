"""
University Books Scraper - Flask Backend
Scrapes books from books.toscrape.com and serves data via API endpoints.
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
import math
import os
import re
import time
import random

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

BASE_URL = "https://books.toscrape.com"
CATALOGUE_URL = f"{BASE_URL}/catalogue"

RATING_MAP = {
    "One": 1,
    "Two": 2,
    "Three": 3,
    "Four": 4,
    "Five": 5
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

def get_soup(url):
    """Fetch a URL and return BeautifulSoup object."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.encoding = "utf-8"
        return BeautifulSoup(response.text, "lxml")
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None


def parse_price(price_str):
    """Parse price string to float."""
    price_str = re.sub(r'[^\d.]', '', price_str)
    try:
        return float(price_str)
    except ValueError:
        return 0.0


def parse_book_card(article):
    """Parse a book article element into a dict."""
    title = article.h3.a.get("title", "Unknown Title")
    relative_url = article.h3.a.get("href", "")
    if relative_url.startswith("../../"):
        book_url = f"{CATALOGUE_URL}/{relative_url[6:]}"
    elif relative_url.startswith("../"):
        book_url = f"{CATALOGUE_URL}/{relative_url[3:]}"
    else:
        book_url = f"{CATALOGUE_URL}/{relative_url}"

    price = parse_price(article.find("p", class_="price_color").text)
    rating_class = article.find("p", class_="star-rating")["class"][1]
    rating = RATING_MAP.get(rating_class, 0)
    in_stock = "In stock" in article.find("p", class_="instock availability").text

    img_src = article.find("img")["src"]
    if img_src.startswith("../../"):
        img_url = f"{BASE_URL}/{img_src[6:]}"
    elif img_src.startswith("../"):
        img_url = f"{BASE_URL}/{img_src[3:]}"
    else:
        img_url = f"{BASE_URL}/{img_src}"

    return {
        "title": title,
        "price": price,
        "rating": rating,
        "in_stock": in_stock,
        "image_url": img_url,
        "book_url": book_url
    }


def scrape_books_page(url):
    """Scrape all books from a single page URL."""
    soup = get_soup(url)
    if not soup:
        return [], None

    articles = soup.find_all("article", class_="product_pod")
    books = [parse_book_card(a) for a in articles]

    next_btn = soup.find("li", class_="next")
    next_url = None
    if next_btn:
        next_href = next_btn.a["href"]
        if "catalogue/" in url:
            base = url.rsplit("/", 1)[0]
            next_url = f"{base}/{next_href}"
        else:
            next_url = f"{CATALOGUE_URL}/{next_href}"

    return books, next_url


def scrape_categories():
    """Scrape all genre categories from the homepage."""
    soup = get_soup(BASE_URL)
    if not soup:
        return []

    nav = soup.find("ul", class_="nav-list")
    if not nav:
        return []

    categories = []
    for li in nav.find_all("li")[1:]:
        a = li.find("a")
        if a:
            name = a.text.strip()
            href = a["href"]
            cat_url = f"{BASE_URL}/{href}"
            categories.append({"name": name, "url": cat_url})

    return categories


def get_book_detail(book_url):
    """Scrape detailed info for a single book."""
    soup = get_soup(book_url)
    if not soup:
        return {}

    product_main = soup.find("div", class_="product_main")
    if not product_main:
        return {}

    title = product_main.find("h1").text.strip()
    price = parse_price(product_main.find("p", class_="price_color").text)
    rating_class = product_main.find("p", class_="star-rating")["class"][1]
    rating = RATING_MAP.get(rating_class, 0)
    availability = product_main.find("p", class_="instock availability")
    in_stock = "In stock" in (availability.text if availability else "")

    desc_div = soup.find("div", id="product_description")
    description = ""
    if desc_div:
        desc_p = desc_div.find_next_sibling("p")
        if desc_p:
            description = desc_p.text.strip()

    img_tag = soup.find("div", class_="item active")
    img_url = ""
    if img_tag:
        img_el = img_tag.find("img")
        if img_el:
            raw = img_el["src"]
            img_url = f"{BASE_URL}/{raw.lstrip('../')}"

    table = soup.find("table", class_="table-striped")
    product_info = {}
    if table:
        for row in table.find_all("tr"):
            header = row.find("th")
            value = row.find("td")
            if header and value:
                product_info[header.text.strip()] = value.text.strip()

    return {
        "title": title,
        "price": price,
        "rating": rating,
        "in_stock": in_stock,
        "description": description,
        "image_url": img_url,
        "upc": product_info.get("UPC", ""),
        "product_type": product_info.get("Product Type", ""),
        "num_reviews": product_info.get("Number of reviews", "0"),
    }


@app.route("/")
def index():
    return send_from_directory(".", "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


@app.route("/api/books")
def api_books():
    page = int(request.args.get("page", 1))
    per_page = min(int(request.args.get("per_page", 20)), 200)
    search = request.args.get("search", "").strip().lower()
    category_url = request.args.get("category_url", "").strip()
    min_price = float(request.args.get("min_price", 0))
    max_price_raw = request.args.get("max_price", "")
    max_price = float(max_price_raw) if max_price_raw else float("inf")
    min_rating = int(request.args.get("min_rating", 0))
    sort = request.args.get("sort", "")

    if category_url:
        start_url = category_url
        if "index.html" in start_url:
            start_url = start_url.replace("index.html", "page-1.html")
    else:
        start_url = f"{BASE_URL}/catalogue/page-1.html"

    all_books = []
    current_url = start_url
    pages_scraped = 0

    while current_url and pages_scraped < 10:
        page_books, next_url = scrape_books_page(current_url)
        all_books.extend(page_books)
        current_url = next_url
        pages_scraped += 1
        time.sleep(0.1)

    filtered = all_books
    if search:
        filtered = [b for b in filtered if search in b["title"].lower()]
    filtered = [b for b in filtered if min_price <= b["price"] <= max_price]
    if min_rating:
        filtered = [b for b in filtered if b["rating"] >= min_rating]

    sort_map = {
        "price_asc":   lambda b: b["price"],
        "price_desc":  lambda b: -b["price"],
        "rating_asc":  lambda b: b["rating"],
        "rating_desc": lambda b: -b["rating"],
        "title_asc":   lambda b: b["title"].lower(),
        "title_desc":  lambda b: b["title"].lower(),
    }
    if sort in sort_map:
        reverse = sort.endswith("_desc") and sort.startswith("title")
        filtered.sort(key=sort_map[sort], reverse=reverse)

    total = len(filtered)
    total_pages = max(1, math.ceil(total / per_page))
    start = (page - 1) * per_page
    end = start + per_page
    paginated = filtered[start:end]

    return jsonify({
        "books": paginated,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages
    })


@app.route("/api/categories")
def api_categories():
    cats = scrape_categories()
    return jsonify({"categories": cats})


@app.route("/api/book-detail")
def api_book_detail():
    book_url = request.args.get("url", "")
    if not book_url:
        return jsonify({"error": "url parameter required"}), 400
    detail = get_book_detail(book_url)
    return jsonify(detail)


@app.route("/api/stats")
def api_stats():
    books_p1, next_url = scrape_books_page(f"{BASE_URL}/catalogue/page-1.html")
    books_p2 = []
    if next_url:
        books_p2, _ = scrape_books_page(next_url)

    sample = books_p1 + books_p2
    prices = [b["price"] for b in sample]
    avg_price = round(sum(prices) / len(prices), 2) if prices else 0
    max_p = max(prices) if prices else 0
    min_p = min(prices) if prices else 0

    rating_dist = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for b in sample:
        rating_dist[b["rating"]] = rating_dist.get(b["rating"], 0) + 1

    return jsonify({
        "sample_size": len(sample),
        "avg_price": avg_price,
        "max_price": max_p,
        "min_price": min_p,
        "in_stock_count": sum(1 for b in sample if b["in_stock"]),
        "rating_distribution": rating_dist
    })


if __name__ == "__main__":
    print("University Book Scraper running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
