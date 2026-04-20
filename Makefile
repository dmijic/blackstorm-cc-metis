COMPOSE = docker compose --project-directory . --env-file infra/docker/.env -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml
COMPOSE_PROD = docker compose --project-directory . --env-file infra/docker/.env -f infra/docker/docker-compose.yml

.PHONY: up down logs migrate seed test first-run deploy-prod verify-hardening

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

migrate:
	$(COMPOSE) exec -T api php artisan migrate --force

seed:
	$(COMPOSE) exec -T api php artisan db:seed --force

test:
	$(COMPOSE) exec -T api php artisan test

first-run:
	./scripts/first_run.sh

deploy-prod:
	./scripts/deploy-prod.sh

verify-hardening:
	./scripts/verify-hardening.sh
