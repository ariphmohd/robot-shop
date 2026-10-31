"""Demo address validation and delivery estimates; no carrier booking is made."""
from datetime import datetime, timedelta, timezone
import re


def validate_address(value):
    if not isinstance(value, dict):
        raise ValueError('Enter a delivery address before placing the order.')
    result = {}
    limits = {'countryCode': (2, 2), 'country': (1, 100), 'city': (1, 100),
              'street': (3, 160), 'flat': (1, 40), 'postalCode': (0, 20)}
    for field, (minimum, maximum) in limits.items():
        text = value.get(field, '' if field == 'postalCode' else None)
        if not isinstance(text, str) or re.search(r'[<>\x00-\x1f\x7f]', text):
            raise ValueError('Check the delivery address fields.')
        text = text.strip()
        if not minimum <= len(text) <= maximum:
            raise ValueError('Check the delivery address fields.')
        result[field] = text
    if not re.fullmatch(r'[a-z]{2}', result['countryCode']):
        raise ValueError('Select a delivery country.')
    city_id = value.get('cityId')
    if type(city_id) is not int or not 0 < city_id <= 10**12:
        raise ValueError('Choose a city from the suggestions.')
    result['cityId'] = city_id
    return result


def delivery_estimate(now=None):
    """3-5 weekdays after order date in UTC; holidays are not modeled."""
    start = (now or datetime.now(timezone.utc)).date()
    def after(days):
        date = start
        while days:
            date += timedelta(days=1)
            if date.weekday() < 5:
                days -= 1
        return date.isoformat()
    return {'from': after(3), 'to': after(5), 'window': '09:00–18:00',
            'timezone': 'destination local time', 'kind': 'demo-estimate'}
