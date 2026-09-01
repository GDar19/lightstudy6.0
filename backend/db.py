import os
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


def clean(doc):
    """Strip Mongo _id from a document (documents use their own uuid `id`)."""
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


def clean_list(docs):
    return [clean(d) for d in docs]
