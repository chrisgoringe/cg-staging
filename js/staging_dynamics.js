import { app } from "../../scripts/app.js";

// TODO - when reloading, wrong names?
// TODO give Load Staged a "load file" button which sets the source and the fields

app.registerExtension({
	name: "cg.customnodes.staging_dynamics",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Load Staged") {
            const onConnectInput = nodeType.prototype.onConnectInput;
            nodeType.prototype.onConnectInput = function (slot) {     
                if (slot == 1) return false; // the fields widget can't be dynamic
                return onConnectInput?.apply(this, arguments);
            }
            nodeType.prototype.isLS = true
        }
        if (nodeType.comfyClass === "Save Staged") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function () { 
                update_fields_widget(this) 
                onConnectionsChange?.apply(this, arguments)
            }
            const onConnectInput = nodeType.prototype.onConnectInput;
            nodeType.prototype.onConnectInput = function (slot, type) {     
                if (!field_for_type(type)) return false // don't allow types we can't handle
                return onConnectInput?.apply(this, arguments)
            }
            nodeType.prototype.isSS = true
        }
    },
    async nodeCreated(node) { 
        if (node.isLS) {
            node.widgets[1].callback = () => {update_outputs(node)}
            update_outputs(node)
        }
        if (node.isSS) {
            node.widgets[node.widgets.length-1].hidden = true 
        }
    },

});

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

function field_for_type(type) {
    return Object.keys(type_map).find((k)=>(type_map[k]==type))
}

/*
When the inputs in the saver are changed, update the fields widget
*/
function update_fields_widget(node) {
    var fields = ""
    node.inputs.forEach((input)=>{
        if (input.name.substring(0,4)=="data") {
            const type = node.graph.links?.[input.link]?.type
            if (type) fields += field_for_type(type)
        }
    })
    node.widgets.find((widgets)=>(widgets.name=='fields')).value = fields
}

/*
When the fields widget in the loader is changed, update the outputs
*/
function update_outputs(node) {
    const w = node.widgets?.[1]
    const graph = (node.subgraph || app.graph)
    if (w) {
        const fields  = w.value || ""
        const types   = fields.split('').map( f => type_map[f] ).filter( t => t )
        const present = node.outputs.map( o => o.type )

        if (JSON.stringify(types) != JSON.stringify(present)) {
            const removed_links = {}
            while (node.outputs.length) { 
                // save the LLinks
                const type = node.outputs[0].type
                const links = node.outputs[0]?.links?.map((lid)=>graph.links[lid]) || []
                if (!removed_links[type]) removed_links[type] = []
                removed_links[type].push(links)
                // remove the output
                node.removeOutput(0)
            }
            types.forEach( (type) => {
                var new_output = node.addOutput(type.toLowerCase(), type)
                // reconnect
                try {
                    const old_links = removed_links[type]?.shift() || []
                    old_links.forEach((llink)=>{
                        const target = graph.getNodeById(llink.target_id)
                        node.connectSlots(new_output, target, target.inputs[llink.target_slot])
                    })
                } catch(e) {
                    console.error(e)
                }
            })
            node.setSize(node.computeSize())
        }

    }
}