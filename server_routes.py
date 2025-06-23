import socket
import argparse
import signal
import pyaudio
import sys
from datetime import datetime
import wave

def handler(signum, frame):
    global playStream, server_socket, connection, output_file
    print("Exiting the program")
    playStream.stop_stream()
    playStream.close()
    pyaudioObj.terminate()
    if 'connection' in globals():
        connection.close()
    server_socket.close()
    if output_file:
        output_file.close()
    sys.exit(0)

signal.signal(signal.SIGINT, handler)

parser = argparse.ArgumentParser(description="AudioStream server")
parser.add_argument("--protocol", required=False, default='tcp', choices=['udp', 'tcp'])
parser.add_argument("--port", required=False, default=12345, type=int)
parser.add_argument("--size", required=False, default=10, type=int, choices=range(10, 151, 10))
parser.add_argument("--save", required=False, help="Save audio to file (WAV format)")
args = parser.parse_args()

print(f"Starting server on port {args.port} using {args.protocol.upper()}")
if args.save:
    print(f"Audio will be saved to {args.save}")

FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 44100
CHUNK = 441
NUMCHUNKS = int(args.size / 10)

pyaudioObj = pyaudio.PyAudio()

try:
    playStream = pyaudioObj.open(format=FORMAT,
                               channels=CHANNELS,
                               rate=RATE,
                               output=True,
                               frames_per_buffer=CHUNK * NUMCHUNKS)
except Exception as e:
    print(f"Error opening audio stream: {e}")
    sys.exit(1)

silence = 0
silenceData = silence.to_bytes(2) * CHUNK * NUMCHUNKS

if args.save:
    try:
        output_file = wave.open(args.save, 'wb')
        output_file.setnchannels(CHANNELS)
        output_file.setsampwidth(pyaudio.get_sample_size(FORMAT))
        output_file.setframerate(RATE)
    except Exception as e:
        print(f"Error opening output file: {e}")
        output_file = None

if args.protocol == 'udp':
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    server_socket.bind(('0.0.0.0', args.port))
else:
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind(('0.0.0.0', args.port))
    server_socket.listen(1)
    print("Waiting for connection...")
    connection, source = server_socket.accept()
    print(f"Connected to {source[0]}:{source[1]}")

expectedSeqNum = 0

def recvData():
    global expectedSeqNum, connection, output_file
    
    print(f"Expecting Sequence #{expectedSeqNum}")

    try:
        if args.protocol == 'udp':
            data, address = server_socket.recvfrom(CHUNK * NUMCHUNKS * 2 + 2)
        else:
            data = connection.recv(CHUNK * NUMCHUNKS * 2 + 2)
            while len(data) < CHUNK * NUMCHUNKS * 2 + 2:
                data += connection.recv(CHUNK * NUMCHUNKS * 2 + 2 - len(data))
    except Exception as e:
        print(f"Error receiving data: {e}")
        handler(signal.SIGINT, None)
        return

    sequenceNumber = int.from_bytes(data[:2], byteorder="little", signed=False)
    audioData = data[2:]

    if expectedSeqNum == sequenceNumber:
        print(f"Received Sequence #{sequenceNumber} ({len(data)} bytes)")
        playStream.write(audioData)
        if output_file:
            output_file.writeframes(audioData)
        expectedSeqNum = (expectedSeqNum + 1) % 65536
    else:
        print(f"Received Out of Sequence #{sequenceNumber} ({len(data)} bytes)")
        playStream.write(silenceData)
        if sequenceNumber > expectedSeqNum:
            expectedSeqNum = sequenceNumber + 1

while True:
    recvData()