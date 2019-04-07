aws dynamodb create-table \
    --table-name Players \
    --attribute-definitions \
        AttributeName=player,AttributeType=S \
    --key-schema AttributeName=player,KeyType=HASH \
    --provisioned-throughput ReadCapacityUnits=1,WriteCapacityUnits=1 \
    --endpoint-url http://localhost:8000