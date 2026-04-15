COMPOSE = docker compose -f infra/docker/docker-compose.yml

.PHONY: up down logs migrate seed test first-run

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
