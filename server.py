import http.server
import socketserver
import webbrowser
import socket
import sys
import os

def find_free_port(start_port=8000, max_attempts=100):
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('', port))
                return port
            except OSError:
                continue
    return None

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def run_server():
    # Change to the script's directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    port = find_free_port()
    if port is None:
        print("Error: Could not find a free port between 8000 and 8100.")
        input("Press Enter to exit...")
        sys.exit(1)

    url = f"http://localhost:{port}/index.html"
    print(f"Starting server at {url}")
    print("Press Ctrl+C to stop the server.")

    # Open browser automatically
    webbrowser.open(url)

    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == "__main__":
    run_server()
