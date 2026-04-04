from abc import ABC, abstractmethod


class VectorDBAdapter(ABC):

    @abstractmethod
    def create_collection(self, name: str, dimension: int) -> None:
        pass

    @abstractmethod
    def insert(self, collection: str, ids: list[str], vectors: list[list[float]], payloads: list[dict]) -> None:
        pass

    @abstractmethod
    def search(self, collection: str, vector: list[float], limit: int = 10) -> list[dict]:
        pass