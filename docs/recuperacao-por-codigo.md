# Recuperação por código — 29/10/2026

O botão **Esqueceu a senha?** solicita um código de seis dígitos e abre a
tela de verificação. A pessoa informa e-mail e código; somente após a validação
aparecem os campos de nova senha e confirmação. O e-mail contém o código,
sem link secreto. A senha não muda apenas ao solicitar ou validar o código.

- Código válido por dez minutos a partir do preparo para envio; máximo de
  cinco tentativas, registradas no banco. A quinta tentativa correta é aceita.
- A validação consome o código e emite autorização de cinco minutos para
  definir a senha. Essa autorização fica somente na memória da página.
- Atualizar a página após validar exige solicitar outro código. Antes de validar,
  é possível digitar o e-mail novamente e usar o código ainda válido.
- O envio continua pela fila e pelo cron já configurados. Retentativas SMTP
  reutilizam o código e o prazo originais; não renovam o limite de tentativas.
- Um novo pedido após o envio anterior gera outro código e substitui o desafio
  anterior quando preparado. Pedidos ainda pendentes são agrupados.
- Links antigos não são aceitos. É necessário solicitar um código novo.
- Não há nova variável de ambiente, migração ou alteração no agendamento.

## Validação desta alteração

A suíte Python local executou 219 testes: 204 passaram e 15 foram ignorados
por dependerem do banco de integração. Mais dois cenários de proteção foram
adicionados depois dessa execução e passaram na suíte focada de recuperação.
O teste Node da interface validou solicitação, erro de código, transição para
nova senha, confirmação e conclusão, com API simulada.

O teste PostgreSQL foi atualizado para verificar consumo concorrente do código
e da autorização por duas instâncias, mas não foi executado nesta alteração:
a criação do PostgreSQL isolado não foi autorizada. A execução anterior de
215 testes da arquitetura por links é histórica e não comprova esse fluxo novo.

Não foram enviados e-mails reais nem redefinidas contas de produção nos testes
desta alteração. O teste de interface usa elementos simulados; não representa
validação visual em dispositivos reais.

```powershell
python -B -m unittest backend.tests.test_password_reset backend.tests.test_reset_mail_queue
node backend/tests/test_password_reset_ui.cjs
```

Veja [recuperacao-serverless.md](recuperacao-serverless.md) para operação,
retentativas SMTP e limitações da entrega.
