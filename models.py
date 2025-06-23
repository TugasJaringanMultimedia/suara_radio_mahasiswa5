from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Broadcast(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    broadcast_date = db.Column(db.String(20), nullable=False)
    start_time = db.Column(db.String(20), nullable=False)
    end_time = db.Column(db.String(20), nullable=True)
    filename = db.Column(db.String(100), unique=True, nullable=False)
    is_live = db.Column(db.Boolean, default=False)
    # --- KOLOM BARU ---
    # Menyimpan durasi siaran dalam total detik.
    duration_in_seconds = db.Column(db.Integer, nullable=True)

    def __repr__(self):
        return f'<Broadcast {self.title}>'
