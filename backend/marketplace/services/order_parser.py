import re
import unicodedata
from decimal import Decimal
from difflib import SequenceMatcher

from ..models import MenuItem, Restaurant


NUMBER_WORDS = {
    "uma": "1",
    "um": "1",
    "duas": "2",
    "dois": "2",
    "tres": "3",
    "quatro": "4",
    "cinco": "5",
    "seis": "6",
    "sete": "7",
    "oito": "8",
    "nove": "9",
    "dez": "10",
    "onze": "11",
    "doze": "12",
    "treze": "13",
    "quatorze": "14",
    "catorze": "14",
    "quinze": "15",
    "dezesseis": "16",
    "dezessete": "17",
    "dezoito": "18",
    "dezenove": "19",
    "vinte": "20",
}

GENERIC_ITEM_WORDS = {
    "pizza",
    "pizzas",
    "refrigerante",
    "refrigerantes",
    "refri",
    "bebida",
    "bebidas",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "com",
    "grande",
    "grandes",
    "media",
    "medio",
    "pequena",
    "pequeno",
    "litro",
    "litros",
    "garrafa",
    "garrafas",
    "lata",
    "latas",
    "unidade",
    "unidades",
    "quero",
    "pedir",
    "pedido",
    "desejo",
    "gostaria",
    "anote",
    "adicionar",
    "adicione",
    "mais",
    "na",
    "no",
    "pizzaria",
    "restaurante",
}


def normalize_text(value):
    text = str(value or "")

    text = unicodedata.normalize("NFD", text)
    text = "".join(
        character
        for character in text
        if unicodedata.category(character) != "Mn"
    )

    text = text.lower()

    for word, number in NUMBER_WORDS.items():
        text = re.sub(
            rf"\b{re.escape(word)}\b",
            number,
            text,
        )

    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def normalize_aliases(value):
    text = normalize_text(value)

    text = re.sub(r"\brefri\b", "refrigerante", text)
    text = re.sub(r"\bbela pizza\b", "bella pizza", text)

    return text


def best_text_similarity(expected, received):
    expected_normalized = normalize_aliases(expected)
    received_normalized = normalize_aliases(received)

    if not expected_normalized or not received_normalized:
        return 0.0

    if expected_normalized in received_normalized:
        return 1.0

    expected_words = expected_normalized.split()
    received_words = received_normalized.split()

    best_score = SequenceMatcher(
        None,
        expected_normalized,
        received_normalized,
    ).ratio()

    minimum_size = max(1, len(expected_words) - 1)
    maximum_size = len(expected_words) + 1

    for size in range(minimum_size, maximum_size + 1):
        if size > len(received_words):
            continue

        for index in range(len(received_words) - size + 1):
            window = " ".join(
                received_words[index:index + size]
            )

            score = SequenceMatcher(
                None,
                expected_normalized,
                window,
            ).ratio()

            best_score = max(best_score, score)

    return best_score


def detect_item_family(value):
    normalized = normalize_aliases(value)
    words = set(normalized.split())

    if "pizza" in words or "pizzas" in words:
        return "pizza"

    if {
        "refrigerante",
        "refrigerantes",
        "bebida",
        "bebidas",
    } & words:
        return "beverage"

    return None


def get_specific_words(value):
    normalized = normalize_aliases(value)

    return {
        word
        for word in normalized.split()
        if (
            word not in GENERIC_ITEM_WORDS
            and not word.isdigit()
        )
    }


def item_matches_family(menu_item, family):
    if family is None:
        return True

    return detect_item_family(menu_item.name) == family


def calculate_item_score(segment, menu_item):
    segment_normalized = normalize_aliases(segment)
    item_normalized = normalize_aliases(menu_item.name)

    if item_normalized in segment_normalized:
        return 1.0

    segment_words = set(segment_normalized.split())
    item_words = set(item_normalized.split())

    if not item_words:
        return 0.0

    token_overlap = len(
        segment_words & item_words
    ) / len(item_words)

    sequence_score = SequenceMatcher(
        None,
        segment_normalized,
        item_normalized,
    ).ratio()

    specific_item_words = get_specific_words(
        menu_item.name
    )
    specific_segment_words = get_specific_words(
        segment
    )

    if specific_item_words:
        specific_overlap = len(
            specific_item_words & specific_segment_words
        ) / len(specific_item_words)
    else:
        specific_overlap = 0.0

    return (
        token_overlap * 0.35
        + sequence_score * 0.25
        + specific_overlap * 0.40
    )


def extract_quantity(segment):
    normalized = normalize_aliases(segment)

    match = re.match(r"^\s*(\d+)\b", normalized)

    if not match:
        return 1, normalized

    quantity = int(match.group(1))

    remaining_text = normalized[match.end():].strip()

    return quantity, remaining_text


def remove_restaurant_suffix(text):
    normalized = normalize_aliases(text)

    patterns = [
        r"\s+da\s+pizzaria\s+.*$",
        r"\s+do\s+restaurante\s+.*$",
        r"\s+na\s+pizzaria\s+.*$",
        r"\s+no\s+restaurante\s+.*$",
    ]

    for pattern in patterns:
        normalized = re.sub(pattern, "", normalized)

    return normalized.strip()


def find_restaurant(text, restaurant_id=None):
    queryset = Restaurant.objects.prefetch_related(
        "menu_items"
    ).filter(active=True)

    if restaurant_id:
        restaurant = queryset.filter(
            pk=restaurant_id
        ).first()

        if restaurant is None:
            return None, {
                "status": "missing_restaurant",
                "message": "O restaurante informado não foi encontrado.",
            }

        return restaurant, None

    restaurants = list(queryset)

    if not restaurants:
        return None, {
            "status": "missing_restaurant",
            "message": "Não há restaurantes ativos cadastrados.",
        }

    scored_restaurants = [
        (
            best_text_similarity(
                restaurant.name,
                text,
            ),
            restaurant,
        )
        for restaurant in restaurants
    ]

    scored_restaurants.sort(
        key=lambda result: result[0],
        reverse=True,
    )

    best_score, best_restaurant = scored_restaurants[0]

    if best_score < 0.68:
        return None, {
            "status": "missing_restaurant",
            "message": "Não identifiquei o restaurante.",
        }

    return best_restaurant, None


def parse_item_segment(segment, menu_items):
    quantity, item_text = extract_quantity(segment)
    family = detect_item_family(item_text)

    candidates = [
        menu_item
        for menu_item in menu_items
        if item_matches_family(menu_item, family)
    ]

    if not candidates:
        return None, {
            "status": "unrecognized_item",
            "message": (
                f"Não encontrei o item {item_text} "
                "no cardápio."
            ),
        }

    segment_specific_words = get_specific_words(
        item_text
    )

    available_specific_words = set()

    for candidate in candidates:
        available_specific_words.update(
            get_specific_words(candidate.name)
        )

    matching_specific_words = (
        segment_specific_words
        & available_specific_words
    )

    if (
        segment_specific_words
        and not matching_specific_words
    ):
        return None, {
            "status": "unrecognized_item",
            "message": (
                f"Não encontrei {item_text} "
                "no cardápio."
            ),
        }

    if (
        len(candidates) > 1
        and not segment_specific_words
    ):
        return None, {
            "status": "ambiguous_item",
            "message": (
                f"Não identifiquei qual {family or 'item'} "
                "você deseja."
            ),
            "options": [
                candidate.name
                for candidate in candidates[:5]
            ],
        }

    scored_items = [
        (
            calculate_item_score(
                item_text,
                menu_item,
            ),
            menu_item,
        )
        for menu_item in candidates
    ]

    scored_items.sort(
        key=lambda result: result[0],
        reverse=True,
    )

    best_score, best_item = scored_items[0]

    if best_score < 0.38:
        return None, {
            "status": "unrecognized_item",
            "message": (
                f"Não encontrei {item_text} "
                "no cardápio."
            ),
        }

    if len(scored_items) > 1:
        second_score = scored_items[1][0]

        if abs(best_score - second_score) < 0.08:
            return None, {
                "status": "ambiguous_item",
                "message": (
                    f"Encontrei mais de uma opção "
                    f"para {item_text}."
                ),
                "options": [
                    menu_item.name
                    for score, menu_item in scored_items[:5]
                    if abs(best_score - score) < 0.08
                ],
            }

    if quantity < 1 or quantity > 20:
        return None, {
            "status": "invalid_quantity",
            "message": (
                "A quantidade deve estar entre "
                "uma e vinte unidades."
            ),
        }

    return {
        "menu_item": best_item,
        "quantity": quantity,
    }, None


def parse_order_text(text, restaurant_id=None):
    raw_text = str(text or "").strip()

    if not raw_text:
        return {
            "status": "invalid_text",
            "message": "O texto do pedido está vazio.",
        }

    restaurant, restaurant_error = find_restaurant(
        text=raw_text,
        restaurant_id=restaurant_id,
    )

    if restaurant_error:
        return restaurant_error

    if not restaurant.registered:
        return {
            "status": "restaurant_unavailable",
            "message": (
                f"{restaurant.name} ainda não recebe "
                "pedidos pelo Aqui Perto."
            ),
            "restaurant": {
                "id": restaurant.id,
                "name": restaurant.name,
            },
        }

    menu_items = list(
        MenuItem.objects.filter(
            restaurant=restaurant,
            active=True,
        )
    )

    if not menu_items:
        return {
            "status": "unrecognized_item",
            "message": (
                f"O restaurante {restaurant.name} "
                "não possui itens ativos no cardápio."
            ),
        }

    normalized_order = remove_restaurant_suffix(
        raw_text
    )

    normalized_order = re.sub(
        r"^(?:quero\s+pedir|quero|desejo|"
        r"gostaria\s+de|meu\s+pedido\s+e|"
        r"pedido\s+de|anote)\s+",
        "",
        normalized_order,
    )

    segments = [
        segment.strip()
        for segment in re.split(
            r"\s+(?:e|mais)\s+|[,;]+",
            normalized_order,
        )
        if segment.strip()
    ]

    if not segments:
        return {
            "status": "unrecognized_item",
            "message": "Não identifiquei os itens do pedido.",
        }

    parsed_items_by_id = {}

    for segment in segments:
        parsed_item, item_error = parse_item_segment(
            segment=segment,
            menu_items=menu_items,
        )

        if item_error:
            return item_error

        menu_item = parsed_item["menu_item"]
        quantity = parsed_item["quantity"]

        if menu_item.id in parsed_items_by_id:
            parsed_items_by_id[
                menu_item.id
            ]["quantity"] += quantity
        else:
            parsed_items_by_id[menu_item.id] = {
                "menu_item": menu_item,
                "quantity": quantity,
            }

    response_items = []
    total = Decimal("0.00")

    for parsed_item in parsed_items_by_id.values():
        menu_item = parsed_item["menu_item"]
        quantity = parsed_item["quantity"]

        unit_price = menu_item.price
        subtotal = unit_price * quantity
        total += subtotal

        response_items.append({
            "menu_item_id": menu_item.id,
            "name": menu_item.name,
            "quantity": quantity,
            "unit_price": f"{unit_price:.2f}",
            "subtotal": f"{subtotal:.2f}",
        })

    return {
        "status": "ready",
        "restaurant": {
            "id": restaurant.id,
            "name": restaurant.name,
        },
        "items": response_items,
        "total": f"{total:.2f}",
    }