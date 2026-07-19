import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Cria o superusuário configurado por variáveis de ambiente."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SUPERUSER_USERNAME", "").strip()
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "").strip()
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")

        if not username:
            self.stdout.write(
                "DJANGO_SUPERUSER_USERNAME não configurado; etapa ignorada."
            )
            return

        User = get_user_model()
        username_field = User.USERNAME_FIELD
        lookup = {username_field: username}

        user = User._default_manager.filter(**lookup).first()

        if user is None:
            if not password:
                raise CommandError(
                    "DJANGO_SUPERUSER_PASSWORD é obrigatório para criar o usuário."
                )

            create_data = dict(lookup)

            if email and hasattr(User, "email"):
                create_data["email"] = email

            User._default_manager.create_superuser(
                password=password,
                **create_data,
            )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Superusuário '{username}' criado com sucesso."
                )
            )
            return

        changed_fields = []

        if not user.is_staff:
            user.is_staff = True
            changed_fields.append("is_staff")

        if not user.is_superuser:
            user.is_superuser = True
            changed_fields.append("is_superuser")

        if email and hasattr(user, "email") and user.email != email:
            user.email = email
            changed_fields.append("email")

        if changed_fields:
            user.save(update_fields=changed_fields)

        self.stdout.write(
            self.style.SUCCESS(
                f"Superusuário '{username}' já existe e está habilitado."
            )
        )
