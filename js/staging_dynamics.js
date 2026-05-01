import { app } from "../../scripts/app.js";

// TODO - when reloading, wrong names?
// TODO give Load Staged a "load file" button which sets the source and the fields
/*
        const uploadWidget = node.addWidget(
          'button',
          inputName,
          '',
          openFileSelection,
          { serialize: false, canvasOnly: true }
        )
        */

app.registerExtension({
	name: "cg.customnodes.staging_dynamics",
    settings: [
        {
            id: "Staging.About",
            name: `Version 0.1`,
            type: () => {return document.createElement('span')},
        },
        {
            id: "Staging.ShowFields",
            name: "Show the fields on the save node",
            type: "boolean",
            tooltip: "Show the field list on the Save node",
            defaultValue: false,
            onChange: (v) => { app.graph?.nodes?.filter((n)=>(n.isSS)).forEach((node)=>(setVisibility(node, v))) }
        },
        {
            id: "Staging.SortInputs",
            name: "Fix input weirdness",
            type: "boolean",
            tooltip: "Try to fix the weird input reordering Comfy does sometimes",
            defaultValue: false,
        },
    ],
  
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeType.comfyClass === "Load Staged") {
            const onConnectInput = nodeType.prototype.onConnectInput;
            nodeType.prototype.onConnectInput = function (slot) {     
                if (slot == 1) return false; // the fields widget can't be dynamic
                return onConnectInput?.apply(this, arguments);
            }
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (side,slot,connect,link_info,output) { 
                if (side==2 && connect && !this.outputs[slot].label) {
                    const input = this.graph.getNodeById(link_info.target_id).inputs[link_info.target_slot]
                    const label = input.label || input.localized_name || input.name
                    this.outputs[slot].label = label
                }
                onConnectionsChange?.apply(this, arguments)
            }
            
            const configure = nodeType.prototype.configure;
            nodeType.prototype.configure = function () {
                configure?.apply(this, arguments)
                update_outputs(this, true)
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
            node.widgets.find((widgets)=>(widgets.name=='fields')).callback = () => {update_outputs(node)}
        }
        if (node.isSS) {
            node.widgets.find((widgets)=>(widgets.name=='fields')).callback = () => {
                if (!allow_fields_set) update_fields_widget(node)
            }
            setVisibility(node, app.ui.settings.getSettingValue("Staging.ShowFields"))
            if (app.ui.settings.getSettingValue("Staging.SortInputs")) setTimeout(sort_inputs, 1000, [node,])
        }
        
    },

});

function setVisibility(node, v) {
    node.widgets.find((widgets)=>(widgets.name=='fields')).hidden = !v
}

var allow_fields_set = false
function setFields(node, fields) {
    allow_fields_set = true
    node.widgets.find((widgets)=>(widgets.name=='fields')).value = fields
    allow_fields_set = false
}

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

function sort_inputs(node) {
    if (!node.inputs) {
        return
    }
    const data_inputs = sorted_data_inputs(node)
    const unlinked    = unlinked_data_inputs(node)[0]
    const not_data_inputs = node.inputs.filter((input)=>(input.name.substring(0,9)!="data.data"))
    if (unlinked) node.inputs = [...data_inputs, unlinked, ...not_data_inputs]
    else node.inputs = [...data_inputs, ...not_data_inputs]
}

function sorted_data_inputs(node) {
    return node.inputs.filter((input)=>(input.name.substring(0,9)=="data.data" && input.link)).sort( (a,b)=> (parseInt(a.name.substring(9)) - parseInt(b.name.substring(9))) )
}

function unlinked_data_inputs(node) {
    return node.inputs.filter((input)=>(input.name.substring(0,9)=="data.data" && !input.link)).sort( (a,b)=> (parseInt(a.name.substring(9)) - parseInt(b.name.substring(9))) )
}
/*
When the inputs in the saver are changed, update the fields widget
*/
function update_fields_widget(node) {
    const data_in = sorted_data_inputs(node)
    var fields = ""
    data_in.forEach((input)=>{
        const type = node.graph.links?.[input.link]?.type
        if (type) fields += field_for_type(type)
    })
    setFields(node, fields)
    if (app.ui.settings.getSettingValue("Staging.SortInputs")) sort_inputs(node)
}

/*
When the fields widget in the loader is changed, update the outputs
*/
function update_outputs(node, allow_star) {
    const w = node.widgets?.[1]
    const graph = (node.subgraph || app.graph)
    if (w) {
        const fields  = w.value || ""
        const types   = fields.split('').map( f => type_map[f] ).filter( t => t )
        const present = node.outputs.map( o => o.type )

        if (JSON.stringify(types) != JSON.stringify(present)) {
            const removed_links = {}
            var i = 0
            while (node.outputs.length) { 
                // save the LLinks
                var type = node.outputs[0].type
                if (allow_star && type=='*') type = types[i]
                i += 1
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