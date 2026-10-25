"""Política de senhas: tamanho, senhas comuns e dados da própria conta."""
import re

MIN_LENGTH, MAX_LENGTH = 12, 256

# Bases muito usadas (em minúsculas, só letras e números). Sufixos numéricos não salvam a senha.
COMMON_BASES = {
    'password', 'passw0rd', 'senha', 'senhasenha', 'senhasegura', 'minhasenha', 'mudar123', 'mudarsenha',
    'admin', 'administrador', 'administrator', 'qwerty', 'qwertyuiop', 'qwertyuiopasdf', 'asdfghjkl',
    'letmein', 'welcome', 'bemvindo', 'iloveyou', 'abc', 'abcdef', 'abcdefghijkl', 'trocar', 'trocarsenha',
    'labiomec', 'labmec', 'lacam', 'labneuromusc', 'laboratorio', 'biomecanica', 'ufrj', 'brasil', 'brasilbrasil',
    'flamengo', 'corinthians', 'palmeiras', 'vasco', 'fluminense', 'botafogo', 'santos', 'saopaulo',
    'monkey', 'dragon', 'master', 'sunshine', 'princess', 'football', 'baseball', 'superman',
}
SEQUENCES = ('0123456789', '9876543210', 'abcdefghijklmnopqrstuvwxyz', 'zyxwvutsrqponmlkjihgfedcba',
             'qwertyuiopasdfghjklzxcvbnm', '1q2w3e4r5t6y7u8i9o0p')


def validate_password(password, email='', name=''):
    """Devolve uma mensagem de erro em português, ou None quando a senha é aceitável."""
    if not isinstance(password, str):
        return 'Informe uma senha válida.'
    if len(password) < MIN_LENGTH:
        return 'Use pelo menos 12 caracteres.'
    if len(password) > MAX_LENGTH:
        return 'A senha deve ter até 256 caracteres.'
    lowered = password.lower()
    compact = re.sub(r'[^a-z0-9]', '', lowered)
    base = compact.rstrip('0123456789')
    if len(set(lowered)) < 5:
        return 'Use uma senha com mais variedade de caracteres.'
    if compact in COMMON_BASES or base in COMMON_BASES:
        return 'Essa senha é muito comum. Escolha outra, de preferência uma frase longa.'
    if len(compact) >= 8 and any(compact in sequence * 2 for sequence in SEQUENCES):
        return 'Evite sequências como 123456789012 ou abcdefghijkl.'
    if lowered.isdigit():
        return 'Use letras ou frases, não apenas números.'
    local = re.sub(r'[^a-z0-9]', '', (email or '').split('@')[0].lower())
    if len(local) >= 4 and local in compact:
        return 'A senha não pode conter o seu e-mail.'
    first = re.sub(r'[^a-z0-9]', '', (name or '').lower())
    if len(first) >= 5 and first in compact:
        return 'A senha não pode conter o seu nome.'
    return None
