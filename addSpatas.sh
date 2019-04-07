aws dynamodb put-item \
    --table-name Players \
    --item '{"player":{"S":"spatas"}}' \
    --return-consumed-capacity TOTAL \
    --endpoint-url http://localhost:8000