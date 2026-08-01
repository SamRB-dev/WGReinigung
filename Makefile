.PHONY: build validate bootstrap deploy apk status shell clean

build:
	docker compose build

validate:
	docker compose run --rm wgclean validate

bootstrap:
	docker compose run --rm wgclean bootstrap

deploy:
	docker compose run --rm wgclean deploy

apk:
	docker compose run --rm wgclean build-apk

status:
	docker compose run --rm wgclean status

shell:
	docker compose run --rm wgclean shell

clean:
	docker compose down -v --remove-orphans
