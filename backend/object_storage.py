"""Private Supabase files. The browser never receives the server API key."""
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from werkzeug.exceptions import NotFound, ServiceUnavailable


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward a server credential to a redirected host.
        return None


class SupabaseFileStorage:
    def __init__(self, url, key, bucket):
        parsed = urlsplit(url)
        if (parsed.scheme != 'https' or not parsed.hostname
                or not parsed.hostname.endswith('.supabase.co')
                or parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ('', '/') or parsed.port not in (None, 443)):
            raise RuntimeError('Configure SUPABASE_URL com a URL HTTPS do projeto Supabase.')
        if not isinstance(key, str) or not key.startswith('sb_secret_') or len(key) < 24:
            raise RuntimeError('Configure SUPABASE_SECRET_KEY com uma chave secreta do servidor.')
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,62}', bucket):
            raise RuntimeError('Configure um nome de bucket valido.')
        self.base = url.rstrip('/') + '/storage/v1'
        self.key, self.bucket = key, quote(bucket, safe='')
        self.opener = build_opener(NoRedirect())

    def _id(self, file_id):
        if not re.fullmatch(r'[a-f0-9]{32}', file_id):
            raise ValueError('Invalid object identifier')
        return file_id

    def _request(self, path, method='GET', data=None, headers=None):
        request = Request(self.base + path, method=method, data=data,
                          headers={'apikey': self.key, **(headers or {})})
        try:
            return self.opener.open(request, timeout=20)
        except HTTPError as error:
            missing = error.code == 404
            if error.code == 400:
                try:
                    missing = str(json.loads(error.read(4096)).get('statusCode')) == '404'
                except (ValueError, AttributeError):
                    pass
            error.close()
            if missing and method == 'GET':
                raise NotFound('Arquivo nao encontrado no armazenamento.') from None
            raise ServiceUnavailable('Armazenamento indisponivel. Tente novamente.') from None
        except (URLError, OSError, TimeoutError):
            raise ServiceUnavailable('Armazenamento indisponivel. Tente novamente.') from None

    def upload(self, file_id, path, mime_type):
        file_id = self._id(file_id)
        with path.open('rb') as stream:
            with self._request('/object/' + self.bucket + '/' + file_id, 'POST', stream,
                               {'Content-Type': mime_type, 'Content-Length': str(path.stat().st_size),
                                'x-upsert': 'false'}) as response:
                response.read(4096)

    def download(self, file_id, destination, expected_size):
        file_id = self._id(file_id)
        try:
            with self._request('/object/authenticated/' + self.bucket + '/' + file_id) as response:
                size = 0
                with destination.open('wb') as output:
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > expected_size:
                            raise ServiceUnavailable('O tamanho do arquivo nao corresponde ao registro.')
                        output.write(chunk)
                if size != expected_size:
                    raise ServiceUnavailable('O arquivo foi recebido incompleto. Tente novamente.')
        except (URLError, OSError, TimeoutError):
            destination.unlink(missing_ok=True)
            raise ServiceUnavailable('Armazenamento indisponivel. Tente novamente.') from None
        except Exception:
            destination.unlink(missing_ok=True)
            raise

    def delete(self, file_id):
        file_id = self._id(file_id)
        payload = json.dumps({'prefixes': [file_id]}).encode()
        with self._request('/object/' + self.bucket, 'DELETE', payload,
                           {'Content-Type': 'application/json'}) as response:
            response.read(4096)
