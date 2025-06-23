# routes/client_routes.py

from flask import Blueprint, render_template, request, send_from_directory
from models import RekamanSiaran
import os

client_bp = Blueprint('client', __name__)

@client_bp.route('/client', methods=['GET'])
def client_page():
    query = request.args.get('q')
    if query:
        rekaman = RekamanSiaran.query.filter(
            (RekamanSiaran.judul.like(f"%{query}%")) | 
            (RekamanSiaran.tanggal.like(f"%{query}%"))
        ).all()
    else:
        rekaman = RekamanSiaran.query.order_by(RekamanSiaran.tanggal.desc()).all()
    return render_template('client.html', rekaman=rekaman)

@client_bp.route('/audio/<filename>')
def audio(filename):
    return send_from_directory('rekaman', filename)
