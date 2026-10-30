import copy
import json
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from delivery import validate_address, delivery_estimate

ADDRESS = {'countryCode': 'in', 'country': 'India', 'city': 'Delhi', 'cityId': 4380870,
           'street': 'Sample Road', 'flat': '4B', 'postalCode': '110001'}
CART = {'total': 72, 'tax': 12, 'items': [
    {'sku': 'STAN-1', 'name': 'Stan', 'price': 67, 'qty': 1, 'subtotal': 67},
    {'sku': 'SHIP', 'name': 'Shipping to India Delhi', 'price': 5, 'qty': 1, 'subtotal': 5}]}


class DeliveryTests(unittest.TestCase):
    def test_normalizes_and_allowlists_fields(self):
        value = dict(ADDRESS, street='  Sample Road  ', unexpected='discard')
        self.assertEqual(validate_address(value), ADDRESS)
        self.assertNotIn('unexpected', validate_address(value))

    def test_required_fields_and_types(self):
        for field in ADDRESS:
            if field == 'postalCode': continue
            for bad in (None, '', {}, []):
                with self.subTest(field=field, bad=bad), self.assertRaises(ValueError):
                    validate_address(dict(ADDRESS, **{field: bad}))
        self.assertEqual(validate_address({k: v for k, v in ADDRESS.items() if k != 'postalCode'})['postalCode'], '')

    def test_rejects_markup_controls_and_oversize(self):
        for value in ('<img onerror=alert(1)>', 'Road\nInjected log', 'x' * 161, '   '):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_address(dict(ADDRESS, street=value))

    def test_city_country_validation(self):
        for bad in (True, -1, 0, '4380870', 1e30):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_address(dict(ADDRESS, cityId=bad))
        with self.assertRaises(ValueError): validate_address(dict(ADDRESS, countryCode='../'))

    def test_friday_estimate_skips_weekend(self):
        result = delivery_estimate(datetime(2026, 10, 30, tzinfo=timezone.utc))
        self.assertEqual((result['from'], result['to']), ('2026-11-04', '2026-11-06'))
        self.assertEqual(result['kind'], 'demo-estimate')

    def test_estimate_crosses_year(self):
        result = delivery_estimate(datetime(2026, 12, 31, tzinfo=timezone.utc))
        self.assertEqual((result['from'], result['to']), ('2027-01-05', '2027-01-07'))


class PaymentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Test the real Flask route while isolating telemetry, gateway, DB and AMQP.
        with patch.dict(sys.modules, {'instana': types.ModuleType('instana'), 'rabbitmq': types.SimpleNamespace(Publisher=Mock())}):
            import payment
        cls.payment = payment
        cls.client = payment.app.test_client()

    def setUp(self):
        self.get = patch.object(self.payment.requests, 'get', return_value=Mock(status_code=200)).start()
        self.post = patch.object(self.payment.requests, 'post', return_value=Mock(status_code=200)).start()
        self.delete = patch.object(self.payment.requests, 'delete', return_value=Mock(status_code=200)).start()
        self.queue = patch.object(self.payment, 'queueOrder').start()
        self.addCleanup(patch.stopall)
        self.payload = dict(copy.deepcopy(CART), deliveryAddress=dict(ADDRESS))

    def test_complete_order_returns_address_and_estimate_without_leaking_address(self):
        with self.assertLogs(self.payment.app.logger, level='INFO') as logs:
            response = self.client.post('/pay/test-user', json=self.payload)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['orderid'])
        self.assertEqual(data['delivery']['address'], ADDRESS)
        self.assertEqual(data['delivery']['estimate']['kind'], 'demo-estimate')
        queued = self.queue.call_args.args[0]
        self.assertEqual(queued['cart'], CART)
        history = json.loads(self.post.call_args.kwargs['data'])
        self.assertEqual(history['cart'], CART)
        for output in (str(queued), str(history), str(logs.output)):
            self.assertNotIn('Sample Road', output)
            self.assertNotIn('deliveryAddress', output)

    def test_missing_or_invalid_address_never_calls_gateway(self):
        for value in (None, {}, dict(ADDRESS, street='<script>')):
            payload = dict(self.payload, deliveryAddress=value)
            response = self.client.post('/pay/test-user', json=payload)
            self.assertEqual(response.status_code, 400)
        self.get.assert_not_called(); self.queue.assert_not_called()

    def test_invalid_cart_is_rejected(self):
        for value in (None, [], 'cart', dict(self.payload, total=-1), dict(self.payload, items=None)):
            self.assertEqual(self.client.post('/pay/test-user', data=json.dumps(value), content_type='application/json').status_code, 400)
        self.queue.assert_not_called()

    def test_no_shipping_cannot_complete(self):
        self.payload['items'] = self.payload['items'][:1]
        self.assertEqual(self.client.post('/pay/test-user', json=self.payload).status_code, 400)
        self.queue.assert_not_called()

    def test_gateway_failure_is_not_success(self):
        self.get.side_effect = [Mock(status_code=200), Mock(status_code=503)]
        self.assertEqual(self.client.post('/pay/test-user', json=self.payload).status_code, 503)
        self.queue.assert_not_called(); self.delete.assert_not_called()

    def test_oversized_body_rejected(self):
        response = self.client.post('/pay/test-user', json=dict(self.payload, extra='x' * 40000))
        self.assertEqual(response.status_code, 413)
        self.get.assert_not_called()


if __name__ == '__main__': unittest.main()
