import os
import json
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer

PORT = 8888

class CustomHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Intercept config API requests
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == '/api/config':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.end_headers()
            
            # Read .env file
            config = {
                'SUPABASE_URL': '',
                'SUPABASE_ANON_KEY': ''
            }
            
            env_path = os.path.join(os.path.dirname(__file__), '.env')
            if os.path.exists(env_path):
                try:
                    with open(env_path, 'r', encoding='utf-8') as f:
                        for line in f:
                            line = line.strip()
                            if not line or line.startswith('#'):
                                continue
                            if '=' in line:
                                key, val = line.split('=', 1)
                                key = key.strip()
                                val = val.strip()
                                # Strip optional quotes around value
                                if val.startswith('"') and val.endswith('"'):
                                    val = val[1:-1]
                                elif val.startswith("'") and val.endswith("'"):
                                    val = val[1:-1]
                                if key in config:
                                    config[key] = val
                except Exception as e:
                    print(f"Error reading .env file: {e}")
            
            # Serve config as JSON
            self.wfile.write(json.dumps(config).encode('utf-8'))
        else:
            # Serve static files from workspace
            super().do_GET()

def run(server_class=HTTPServer, handler_class=CustomHandler, port=PORT):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Starting server on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()

if __name__ == '__main__':
    # Ensure working directory is the folder of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    run()
