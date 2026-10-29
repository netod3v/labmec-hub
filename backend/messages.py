from copy import deepcopy


def visible_document(collection, data, user):
    if collection != 'dms' or not isinstance(data, dict):
        return data
    result = deepcopy(data)
    result.pop('deletedFor', None)
    result['messages'] = {
        key: {field: value for field, value in message.items() if field != 'hiddenFor'}
        for key, message in (data.get('messages') or {}).items()
        if not (message.get('hiddenFor') or {}).get(user['id'])
    }
    return result
