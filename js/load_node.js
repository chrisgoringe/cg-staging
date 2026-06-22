import { app } from "../../scripts/app.js";
import { fields_widget, type_for_field } from "./shared.js"
import { log, log_important } from "./shared.js";

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
            LoadNode.update_outputs(this, "node.configure", true)
        }

        nodeType.prototype._cg_staging_afterConfigureGraph = function(allow_star) { LoadNode.update_outputs(this, "after_configure_graph", allow_star) }

        nodeType.prototype.isLS = true
    }

    static node_created(node) {
        const w = fields_widget(node)
        if (w)  w.callback = () => {LoadNode.update_outputs(node, "fields widget")}
    }

    static update_outputs(node, reason, allow_star) {
        log(`In update_outputs (${reason}) for ${node.id} with allow_star = ${allow_star}`, 2)
        if (node._erroring) return
        const w = fields_widget(node)
        const graph = (node.subgraph || app.graph)
        if (w) {
            const fields  = w.value || ""
            const types   = fields.split('').map( f => type_for_field(f) ).filter( t => t )
            const present = node.outputs.slice(1).map( o => o.type )

            if (JSON.stringify(types) != JSON.stringify(present)) {
                log(`Types expected ${JSON.stringify(types)} don't match ${JSON.stringify(present)}`,2)
                const removed_output_links = {}
                var i = 0
                while (node.outputs.length>1) { 
                    // save the LLinks
                    var type = node.outputs[1].type
                    log(`Output has type ${type}`)
                    if (allow_star && type=='*') {
                        type = types[i]
                        log(`changed type to ${type}`)
                    }
                    i += 1
                    if (type) {
                        const links = node.outputs[1]?.links?.map((lid)=>graph.links[lid]) || []
                        if (!removed_output_links[type]) removed_output_links[type] = []
                        removed_output_links[type].push(links)
                        log(`${links.length} links stashed`)
                    }

                    // remove the output
                    try {node.removeOutput(1)}
                    catch (e) { 
                        log_important(`Flagging ${node.id} because:`)
                        console.error(e)
                        node._erroring = true
                        return
                    }
                }
                types.forEach( (type, i) => {
                    log(`Adding output ${i+1}`,2)
                    var new_output = node.addOutput(type.toLowerCase(), type)
                    // reconnect
                    try {
                        const old_outputs_for_type = removed_output_links[type]
                        
                        if (old_outputs_for_type && old_outputs_for_type.length>0) {
                            const old_links_to_add = old_outputs_for_type.shift()
                            console.log(`Adding ${old_links_to_add.length} links`)
                            old_links_to_add.forEach((llink)=>{
                                const target = graph.getNodeById(llink.target_id)
                                const newlink = node.connectSlots(new_output, target, target.inputs[llink.target_slot])
                                log(`New link id = ${newlink.id}`)
                            })
                        }
                    } catch(e) {
                        console.error(e)
                    }
                })
                Object.keys(removed_output_links).filter((k)=>(removed_output_links[k].length>0)).forEach((k)=>{
                    log(`${removed_output_links[k].length} outputs of type ${k} left`)
                })
                node.setSize(node.computeSize())
            }

        }
    }
}
