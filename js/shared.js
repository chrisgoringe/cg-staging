export function fields_widget(node) { return node.widgets.find((widgets)=>(widgets.name=='fields')) }

/*
To add a new type, add it here, with a unique key mapping to the Comfy type, and 
in nodes_staging.py
*/
const type_map = {
    "i": "IMAGE",
    "m": "MASK",
    "l": "LATENT",
    "g": "SIGMAS",
    "s": "STRING",
    "n": "INT",
    "f": "FLOAT",
}

export function field_for_type(type) {
    return Object.keys(type_map).find((k)=>(type_map[k]==type))
}

export function type_for_field(field) {
    return type_map[field]
}
