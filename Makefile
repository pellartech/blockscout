docker-ecr-login:
	aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin 434305222479.dkr.ecr.ap-southeast-1.amazonaws.com

docker-build:
	docker build -f docker/Dockerfile -t blockscout:latest .

docker-push:
	docker tag blockscout:latest 434305222479.dkr.ecr.ap-southeast-1.amazonaws.com/prime-explorer:latest
	docker push 434305222479.dkr.ecr.ap-southeast-1.amazonaws.com/prime-explorer:latest

deploy-devnet:
	kubectl apply -k deployment/base