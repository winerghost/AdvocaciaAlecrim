from ..extensions import db


class Faq(db.Model):
    __tablename__ = "faqs"

    id = db.Column(db.Integer, primary_key=True)
    question = db.Column(db.String(255), nullable=False)
    answer = db.Column(db.Text, nullable=False)
    order = db.Column(db.Integer, default=0)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "question": self.question,
            "answer": self.answer,
        }

    def to_admin_dict(self) -> dict:
        # Só usado nas rotas /api/admin/* - inclui `order`, que controla a
        # ordem de exibição (GET /api/faqs continua expondo só `to_dict()`).
        return {**self.to_dict(), "order": self.order}
