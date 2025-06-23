# routes/penyiar_routes.py

from flask import Blueprint, render_template, request, redirect, url_for, flash
from datetime import datetime
import os
from models import RekamanSiaran, db

penyiar_bp = Blueprint('penyiar', __name__)

# Folder rekaman akan disimpan
RECORD_FOLDER = 'rekaman'
os.makedirs(RECORD_FOLDER, exist_ok=True)

@penyiar_bp.route('/penyiar', methods=['GET', 'POST'])
def penyiar_page():
    if request.method == 'POST':
        judul = request.form['judul']
        tanggal = request.form['tanggal']
        waktu_mulai = request.form['waktu_mulai']
        waktu_berakhir = request.form['waktu_berakhir']

        # Nama file rekaman
        filename = f"{judul.replace(' ', '_')}_{tanggal}.wav"
        filepath = os.path.join(RECORD_FOLDER, filename)

        # Simpan ke database
        rekaman = RekamanSiaran(
            judul=judul,
            tanggal=tanggal,
            waktu_mulai=waktu_mulai,
            waktu_berakhir=waktu_berakhir,
            nama_file=filename
        )
        db.session.add(rekaman)
        db.session.commit()

        flash('Siaran berhasil disimpan!', 'success')
        return redirect(url_for('penyiar.penyiar_page'))

    return render_template('penyiar.html')
