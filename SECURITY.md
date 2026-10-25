# Segurança do LABIOMEC Hub

## O que está protegido

| Camada | Proteção |
|---|---|
| Sessão | Cookie `HttpOnly` + `SameSite=Lax`; com HTTPS vira `__Host-labiomec_session` (`Secure`, preso ao domínio); expira em 12 h; trocar a senha derruba todas as sessões |
| Escrita na API | Token CSRF + checagem de `Origin` em toda requisição que altera dados |
| Scripts no navegador | **CSP estrita**: só scripts do próprio site; o único script inline recebe um *nonce* novo a cada resposta. Atributos injetados como `onerror=` não executam |
| Outros cabeçalhos | `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP e HSTS (quando `COOKIE_SECURE=true`) |
| Senhas | 12 a 256 caracteres, sem senhas comuns, sequências, só números, nem o seu e-mail ou nome |
| Login | Limite por IP e por conta (15 tentativas / 15 min), tempo de resposta igual para contas que não existem, recusas registradas no log sem guardar o e-mail |
| Uploads | Nome sanitizado, armazenamento por UUID, tipo detectado no servidor, cota do laboratório e limite de envios por pessoa por hora |
| Foto de perfil | Só imagem embutida (JPEG/PNG/WebP/GIF até ~1 MB). Fotos antigas inválidas deixam de ser entregues |
| Identificadores | Caminhos de documentos não aceitam `< > " ' `` ` ``, nem caracteres de controle |
| Contêiner | Usuário sem privilégios, `cap_drop: ALL`, `no-new-privileges`, limite de processos, *healthcheck* |

## Checklist para publicar na internet

1. Coloque o app atrás de um proxy HTTPS (Caddy, Nginx, Traefik). Não exponha a porta 5000 direto.
2. No `.env`:
   - `COOKIE_SECURE=true`
   - `PUBLIC_ORIGIN=https://seu-dominio`
   - `ALLOW_LOCAL_FRAME_PREVIEW=false`
   - `ALLOW_REGISTRATION=false` (veja a decisão de projeto abaixo)
   - `TRUSTED_PROXY_COUNT=1` (ou o número de proxies à frente do app). Sem isso, o limite de tentativas enxerga o IP do proxy.
   - O `LIVEKIT_URL` deve usar `wss://`.
3. Gere segredos novos e fortes (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) para `SECRET_KEY`, `POSTGRES_PASSWORD`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`.
4. Nunca compartilhe `.env`, `.venv` ou `debug.log`. Se já compartilhou, troque a senha de app do Gmail e os segredos.
5. Faça backup do volume do banco e do volume `lab_files`.
6. Atualize as imagens e rode `pip-audit -r backend/requirements.txt` periodicamente.

## Decisões de projeto que merecem sua atenção

- **Cada pessoa escolhe as próprias unidades.** Qualquer conta pode se incluir em qualquer unidade existente (por exemplo LACAM ou LabNeuroMusc) e passa a ler o conteúdo privado dela. Com `ALLOW_REGISTRATION=true`, quem se cadastra pode ver tudo que for privado. Mantenha o cadastro fechado e crie as contas com `create-user`, ou mude a regra para exigir aprovação de um administrador.
- **Sem segundo fator (MFA).** Contas de administrador dependem só da senha. Use senhas longas e únicas.
- **Uploads de até 2 GB** (`MAX_UPLOAD_MB`). Reduza se o laboratório não precisa disso.
- **Auditoria**: ações administrativas ficam registradas no painel. Eventos de login ficam só no log do servidor, sem e-mail nem IP.

## Comandos úteis

```powershell
# Trocar a senha de uma conta (derruba as sessões abertas)
docker compose run --rm hub flask --app backend.app reset-password admin@example.org

# Ver recusas de login e limites atingidos
docker compose logs hub | Select-String "seguranca"

# Rodar todos os testes contra um PostgreSQL temporário
docker compose run --rm hub python -m backend.tests.run_postgres_tests
```
