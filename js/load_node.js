import { app } from "../../scripts/app.js";
import { fields_widget, type_for_field } from "./shared.js"

export class LoadNode {
    static before_register(nodeType) {
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
            LoadNode.update_outputs(this, true)
        }

        nodeType.prototype._cg_staging_afterConfigureGraph = function(allow_star) { LoadNode.update_outputs(this, allow_star) }

        nodeType.prototype.isLS = true
    }

    static node_created(node) {
        const w = fields_widget(node)
        if (w)  w.callback = () => {LoadNode.update_outputs(node)}
    }

    static update_outputs(node, allow_star) {
        const w = fields_widget(node)
        const graph = (node.subgraph || app.graph)
        if (w) {
            const fields  = w.value || ""
            const types   = fields.split('').map( f => type_for_field(f) ).filter( t => t )
            const present = node.outputs.slice(1).map( o => o.type )

            if (JSON.stringify(types) != JSON.stringify(present)) {
                const removed_links = {}
                var i = 0
                while (node.outputs.length>1) { 
                    // save the LLinks
                    var type = node.outputs[1].type
                    if (allow_star && type=='*') type = types[i]
                    i += 1
                    const links = node.outputs[1]?.links?.map((lid)=>graph.links[lid]) || []
                    if (!removed_links[type]) removed_links[type] = []
                    removed_links[type].push(links)
                    // remove the output
                    node.removeOutput(1)
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
}


