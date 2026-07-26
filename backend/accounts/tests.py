from django.test import TestCase
from rest_framework.test import APIClient

from .models import Role, User
from .permissions import capabilities_for


class AuthTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='m1', password='Manager@1234', role=Role.MANAGER)
        self.accountant = User.objects.create_user(
            username='a1', password='Hesab@1234', role=Role.ACCOUNTANT)
        self.client = APIClient()

    def login(self, username, password):
        response = self.client.post('/api/accounts/login/',
                                    {'username': username, 'password': password}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        return response.data

    def test_login_returns_token_and_user(self):
        data = self.login('m1', 'Manager@1234')
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['user']['role'], Role.MANAGER)

    def test_login_with_wrong_password_fails_in_persian(self):
        response = self.client.post('/api/accounts/login/',
                                    {'username': 'm1', 'password': 'wrong'}, format='json')
        self.assertEqual(response.status_code, 401)
        self.assertIn('اشتباه', str(response.data))

    def test_anonymous_access_is_denied(self):
        response = self.client.get('/api/parties/')
        self.assertEqual(response.status_code, 401)

    def test_health_endpoint_is_public(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ok')

    def test_me_endpoint(self):
        self.login('a1', 'Hesab@1234')
        response = self.client.get('/api/accounts/me/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'a1')
        self.assertFalse(response.data['capabilities']['users.manage'])

    def test_change_password(self):
        self.login('a1', 'Hesab@1234')
        response = self.client.post('/api/accounts/me/change-password/', {
            'current_password': 'Hesab@1234',
            'new_password': 'NewPass@9876',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.accountant.refresh_from_db()
        self.assertTrue(self.accountant.check_password('NewPass@9876'))

    def test_change_password_rejects_wrong_current(self):
        self.login('a1', 'Hesab@1234')
        response = self.client.post('/api/accounts/me/change-password/', {
            'current_password': 'nope',
            'new_password': 'NewPass@9876',
        }, format='json')
        self.assertEqual(response.status_code, 400)


class PermissionTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='m1', password='Manager@1234', role=Role.MANAGER)
        self.accountant = User.objects.create_user(
            username='a1', password='Hesab@1234', role=Role.ACCOUNTANT)
        self.client = APIClient()

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_manager_capabilities_are_all_true(self):
        self.assertTrue(all(capabilities_for(self.manager).values()))

    def test_accountant_cannot_delete_or_manage_users(self):
        caps = capabilities_for(self.accountant)
        self.assertFalse(caps['users.manage'])
        self.assertFalse(caps['cheques.delete'])
        self.assertFalse(caps['orders.confirm'])
        self.assertTrue(caps['cheques.add'])
        self.assertTrue(caps['reports.profit_loss'])

    def test_user_management_requires_manager(self):
        self.auth(self.accountant)
        self.assertEqual(self.client.get('/api/accounts/users/').status_code, 403)
        self.auth(self.manager)
        self.assertEqual(self.client.get('/api/accounts/users/').status_code, 200)

    def test_manager_can_create_user(self):
        self.auth(self.manager)
        response = self.client.post('/api/accounts/users/', {
            'username': 'new_acc', 'role': Role.ACCOUNTANT,
            'password': 'Complex@2468', 'first_name': 'تست',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(User.objects.filter(username='new_acc').exists())

    def test_user_cannot_delete_self(self):
        self.auth(self.manager)
        response = self.client.delete(f'/api/accounts/users/{self.manager.id}/')
        self.assertEqual(response.status_code, 400)

    def test_toggle_active(self):
        self.auth(self.manager)
        response = self.client.post(f'/api/accounts/users/{self.accountant.id}/toggle_active/')
        self.assertEqual(response.status_code, 200)
        self.accountant.refresh_from_db()
        self.assertFalse(self.accountant.is_active)
