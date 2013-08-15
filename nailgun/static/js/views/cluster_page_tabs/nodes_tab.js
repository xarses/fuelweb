/*
 * Copyright 2013 Mirantis, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
**/
define(
[
    'utils',
    'models',
    'views/common',
    'views/dialogs',
    'text!templates/cluster/nodes_management_panel.html',
    'text!templates/cluster/nodes_filter.html',
    'text!templates/cluster/assign_roles_panel.html',
    'text!templates/cluster/delete_nodes_panel.html',
    'text!templates/cluster/node_list.html',
    'text!templates/cluster/node.html',
    'text!templates/cluster/node_status.html',
    'text!templates/cluster/edit_node_disks.html',
    'text!templates/cluster/node_disk.html',
    'text!templates/cluster/volume_style.html',
    'text!templates/cluster/edit_node_interfaces.html',
    'text!templates/cluster/node_interface.html'
],
function(utils, models, commonViews, dialogViews, nodesManagementPanelTemplate, nodesFilterTemplate, assignRolesPanelTemplate, deleteNodesPanelTemplate, nodeListTemplate, nodeTemplate, nodeStatusTemplate, editNodeDisksScreenTemplate, nodeDisksTemplate, volumeStylesTemplate, editNodeInterfacesScreenTemplate, nodeInterfaceTemplate) {
    'use strict';
    var NodesTab, Screen, ScreenWithNodesPolling, NodesByRolesScreen, NodesManagementPanel, NodesFilter, AssignRolesPanel, DeleteNodesPanel, NodeList, Node, EditNodeScreen, EditNodeDisksScreen, NodeDisk, EditNodeInterfacesScreen, NodeInterface;

    NodesTab = commonViews.Tab.extend({
        screen: null,
        scrollPositions: {},
        hasChanges: function() {
            return this.screen && _.result(this.screen, 'hasChanges');
        },
        changeScreen: function(NewScreenView, screenOptions) {
            var options = _.extend({model: this.model, tab: this, screenOptions: screenOptions || []});
            var newScreen = new NewScreenView(options);
            var oldScreen = this.screen;
            if (oldScreen) {
                if (oldScreen.keepScrollPosition) {
                    this.scrollPositions[oldScreen.constructorName] = $(window).scrollTop();
                }
                oldScreen.$el.fadeOut('fast', _.bind(function() {
                    oldScreen.tearDown();
                    newScreen.render();
                    newScreen.$el.hide().fadeIn('fast');
                    this.$el.html(newScreen.el);
                    if (newScreen.keepScrollPosition && this.scrollPositions[newScreen.constructorName]) {
                        $(window).scrollTop(this.scrollPositions[newScreen.constructorName]);
                    }
                }, this));
            } else {
                this.$el.html(newScreen.render().el);
            }
            this.screen = newScreen;
            this.registerSubView(this.screen);
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.revertChanges = _.bind(function() {
                return this.screen && this.screen.revertChanges();
            }, this);
        },
        routeScreen: function(options) {
            var screens = {
                'list': NodesByRolesScreen,
                'disks': EditNodeDisksScreen,
                'interfaces': EditNodeInterfacesScreen
            };
            this.changeScreen(screens[options[0]] || screens.list, options.slice(1));
        },
        render: function() {
            this.routeScreen(this.tabOptions);
            return this;
        }
    });

    Screen = Backbone.View.extend({
        constructorName: 'Screen',
        keepScrollPosition: false,
        goToNodeList: function() {
            app.navigate('#cluster/' + this.model.id + '/nodes', {trigger: true});
        }
    });

    ScreenWithNodesPolling = Screen.extend({
        constructorName: 'ScreenWithNodesPolling',
        updateInterval: 20000,
        scheduleUpdate: function() {
            this.registerDeferred($.timeout(this.updateInterval).done(_.bind(this.update, this)));
        }
    });

    NodesByRolesScreen = ScreenWithNodesPolling.extend({
        className: 'nodes-by-roles-screen',
        constructorName: 'NodesByRolesScreen',
        keepScrollPosition: true,
        update: function() {
            var complete = _.after(2, _.bind(this.scheduleUpdate, this));
            this.model.get('nodes').fetch({data: {cluster_id: this.model.id}}).always(complete);
            this.unallocatedNodes.fetch({data: {cluster_id: ''}}).always(complete);
        },
        initialize: function(options) {
            this.tab = options.tab;
            this.model.on('change:mode change:status', this.render, this);
            this.model.get('nodes').on('resize', this.renderAllocatedNodes, this);
            this.model.get('tasks').each(this.bindTaskEvents, this);
            this.model.get('tasks').on('add', this.onNewTask, this);
            this.unallocatedNodes = new models.Nodes();
            this.unallocatedNodes.deferred = this.unallocatedNodes.fetch({data: {cluster_id: ''}}).done(_.bind(this.render, this));
            this.unallocatedNodes.on('resize', this.renderUnallocatedNodes, this);
            this.scheduleUpdate();
        },
        calculateBatchActionsButtonsState: function() {
            this.$('.btn-delete-nodes').prop('disabled', !this.$('.node-list.allocated .node.checked').length);
            this.$('.btn-assign-roles').prop('disabled', !this.$('.node.checked').length);
        },
        bindTaskEvents: function(task) {
            return (task.get('name') == 'deploy' || task.get('name') == 'verify_networks') ? task.on('change:status', this.render, this) : null;
        },
        onNewTask: function(task) {
            return this.bindTaskEvents(task) && this.render();
        },
        renderAllocatedNodes: function() {
            this.model.get('nodes').cluster = this.model;
            var nodeListView = new NodeList({nodes: this.model.get('nodes'), screen: this});
            this.registerSubView(nodeListView);
            this.$el.append(nodeListView.render().el);
        },
        renderUnallocatedNodes: function() {
            var nodeListView = new NodeList({nodes: this.unallocatedNodes, screen: this});
            this.registerSubView(nodeListView);
            this.$el.append(nodeListView.render().el);
        },
        render: function() {
            this.tearDownRegisteredSubViews();
            this.$el.html('');
            this.managementPanel = new NodesManagementPanel({
                filters: this.model.get('nodes').filters(),
                screen: this
            });
            this.registerSubView(this.managementPanel);
            this.$el.append(this.managementPanel.render().el);
            this.renderAllocatedNodes();
            this.renderUnallocatedNodes();
            return this;
        }
    });

    NodesManagementPanel = Backbone.View.extend({
        className: 'nodes-management-panel',
        template: _.template(nodesManagementPanelTemplate),
        events: {
            'click .btn-assign-roles:not(:disabled)' : 'showAssignRolesPanel',
            'click .btn-delete-nodes:not(:disabled)' : 'showDeleteNodesPanel'
        },
        initialize: function(options) {
            _.defaults(this, options);
        },
        filterChosenNodes: function(nodes) {
            var chosenNodesIds = this.screen.$('input[type=checkbox]:checked').map(function() {return parseInt($(this).val(), 10);}).get();
            return nodes.filter(function(node) {return _.contains(chosenNodesIds, node.id);});
        },
        getChosenNodes: function() {
            return _.union(this.filterChosenNodes(this.screen.model.get('nodes')), this.filterChosenNodes(this.screen.unallocatedNodes));
        },
        showAssignRolesPanel: function() {
            this.$('.assign-roles-panel').html('');
            var assignRolesPanel = new AssignRolesPanel({nodes: new models.Nodes(this.getChosenNodes())});
            this.registerSubView(assignRolesPanel);
            this.$('.assign-roles-panel').html(assignRolesPanel.render().el);
            this.$('.roles-panel').show();
        },
        showDeleteNodesPanel: function() {
            this.$('.delete-nodes-panel').html('');
            var deleteNodesPanel = new DeleteNodesPanel({nodes: new models.Nodes(this.getChosenNodes())});
            this.registerSubView(deleteNodesPanel);
            this.$('.delete-nodes-panel').html(deleteNodesPanel.render().el);
        },
        renderFilters: function() {
            _.each(this.filters, function(filter) {
                var filterView = new NodesFilter({
                    filter: filter,
                    screen: this.screen
                });
                this.registerSubView(filterView);
                this.$('#nodes-filters').append(filterView.render().el);
            }, this);
        },
        render: function() {
            this.tearDownRegisteredSubViews();
            this.$el.html(this.template());
            this.renderFilters();
            return this;
        }
    });

    NodesFilter = Backbone.View.extend({
        className: 'nodes-filter',
        template: _.template(nodesFilterTemplate),
        events: {
            'change select' : 'applyFilter'
        },
        applyFilter: function(e) {
            var type = this.$(e.currentTarget).data('type');
            var value = this.$(e.currentTarget).val();
            if (type == 'attributes') {

            } else {

            }
        },
        initialize: function(options) {
            _.defaults(this, options);
        },
        render: function() {
            this.$el.html(this.template({filter: this.filter}));
            return this;
        }
    });

    AssignRolesPanel = Backbone.View.extend({
        template: _.template(assignRolesPanelTemplate),
        className: 'roles-panel hide',
        events: {
            'change input[type=checkbox]' : 'calculateAssignButtonState',
            'click .btn-close' : 'hide',
            'click .btn-assign:not(:disabled)' : 'assignRoles'
        },
        calculateAssignButtonState: function() {
            this.$('.btn-assign').prop('disabled', !this.$('input[type=checkbox]:checked').length);
        },
        hide: function() {
            this.$el.hide();
        },
        assignRoles: function() {
            this.$('.btn-assign').prop('disabled', true);
            var roles = this.$('input[type=checkbox]:checked').map(function() {return $(this).val();}).get();
            this.nodes.each(function(node) {
                node.set({
                    roles: roles,
                    cluster_id: app.page.tab.model.id,
                    pending_addition: true,
                    pending_deletion: false
                });
            });
            this.nodes.toJSON = function(options) {
                return this.map(function(node) {
                    return _.pick(node.attributes, 'id', 'cluster_id', 'role', 'pending_addition', 'pending_deletion');
                });
            };
            var deferred = this.nodes.sync('update', this.nodes)
                .done(_.bind(function() {
                    //app.page.tab.model.fetch();
                    //app.page.tab.model.fetchRelated('nodes');
                    //app.page.tab.screen.render(); // after fetch?!
                    app.navbar.refresh();
                    app.page.removeFinishedTasks();
                }, this))
                .fail(_.bind(function() {
                    this.$('.btn-assign').prop('disabled', false);
                    utils.showErrorDialog({title: 'Unable to assign roles'});
                }, this));
        },
        initialize: function(options) {
            _.defaults(this, options);
        },
        render: function() {
            this.$el.html(this.template({
                nodes: this.nodes,
                roles: app.page.tab.model.get('release').get('available_roles'),
                assignedRoles: []
            }));
            return this;
        }
    });

    DeleteNodesPanel = Backbone.View.extend({
        template: _.template(deleteNodesPanelTemplate),
        className: 'delete-nodes-panel',
        events: {
            'click .btn-delete:not(:disabled)' : 'deleteNodes'
        },
        deleteNodes: function() {
            this.$('.btn-delete').prop('disabled', true);
            this.nodes.each(function(node) {
                node.set({
                    roles: [],
                    cluster_id: null,
                    pending_addition: false,
                    pending_deletion: true
                });
            });
            this.nodes.toJSON = function(options) {
                return this.map(function(node) {
                    return _.pick(node.attributes, 'id', 'cluster_id', 'role', 'pending_addition', 'pending_deletion');
                });
            };
            var deferred = this.nodes.sync('update', this.nodes)
                .done(_.bind(function() {
                    this.$el.hide();
                    //app.page.tab.model.fetch();
                    //app.page.tab.model.fetchRelated('nodes');
                    //app.page.tab.screen.render(); // after fetch?!
                    app.navbar.refresh();
                    app.page.removeFinishedTasks();
                }, this))
                .fail(_.bind(function() {
                    this.$('.btn-delete').prop('disabled', false);
                    utils.showErrorDialog({title: 'Unable to delete nodes'});
                }, this));
        },
        initialize: function(options) {
            _.defaults(this, options);
        },
        render: function() {
            this.$el.html(this.template({nodes: this.nodes}));
            return this;
        }
    });

    NodeList = Backbone.View.extend({
        className: 'node-list',
        template: _.template(nodeListTemplate),
        events: {
            'change .select-nodes' : 'selectAllNodes'
        },
        selectAllNodes: function(e) {
            var checked = this.$(e.currentTarget).is(':checked');
            _.each(this.subViews, function(nodeView) {
                nodeView.selected = checked;
                nodeView.$el.toggleClass('checked', checked);
                nodeView.render();
            });
            this.screen.calculateBatchActionsButtonsState();
        },
        calculateSelectAllTumblerState: function() {
            this.$('.select-nodes').prop('checked', this.$('.node.checked').length == this.$('.node').length);
        },
        initialize: function(options) {
            _.defaults(this, options);
        },
        renderNode: function(node) {
            var nodeView = new Node({
                node: node,
                renameable: true,
                list: this
            });
            this.registerSubView(nodeView);
            this.$('.nodes').append(nodeView.render().el);
        },
        render: function() {
            this.tearDownRegisteredSubViews();
            this.$el.html(this.template({
                cluster: this.nodes.cluster,
                nodes: this.nodes,
                visibleNodes: this.nodes,
            }));
            var nodeListClass = this.nodes.cluster ? 'allocated' : 'unallocated';
            this.$el.addClass(nodeListClass);
            if (this.nodes.length) {
                this.nodes.each(this.renderNode, this);
            }
            return this;
        }
    });

    Node = Backbone.View.extend({
        className: 'node',
        template: _.template(nodeTemplate),
        nodeStatusTemplate: _.template(nodeStatusTemplate),
        events: {
            'change .node-checkbox input': 'selectNode',
            'click .node-renameable': 'startNodeRenaming',
            'keydown .name input': 'onNodeNameInputKeydown',
            'click .node-hardware, .node-settings': 'showNodeDetails',
            'click .roles': 'showRolesPanel'
        },
        selectNode: function() {
            this.$el.toggleClass('checked');
            this.selected = !this.selected;
            this.list.calculateSelectAllTumblerState();
            this.list.screen.calculateBatchActionsButtonsState();
        },
        startNodeRenaming: function() {
            if (!this.renameable || this.renaming) {return;}
            $('html').off(this.eventNamespace);
            $('html').on(this.eventNamespace, _.after(2, _.bind(function(e) {
                if (!$(e.target).closest(this.$('.name input')).length) {
                    this.endNodeRenaming();
                }
            }, this)));
            this.renaming = true;
            this.render();
            this.$('.name input').focus();
        },
        endNodeRenaming: function() {
            $('html').off(this.eventNamespace);
            this.renaming = false;
            this.render();
        },
        applyNewNodeName: function() {
            var name = $.trim(this.$('.name input').val());
            if (name && name != this.node.get('name')) {
                this.$('.name input').attr('disabled', true);
                this.node.save({name: name}, {patch: true, wait: true}).always(_.bind(this.endNodeRenaming, this));
            } else {
                this.endNodeRenaming();
            }
        },
        onNodeNameInputKeydown: function(e) {
            if (e.which == 13) {
                this.applyNewNodeName();
            } else if (e.which == 27) {
                this.endNodeRenaming();
            }
        },
        showNodeDetails: function() {
            var clusterId, deployment = false;
            try {
                clusterId = app.page.tab.model.id;
                deployment = !!app.page.tab.model.task('deploy', 'running');
            } catch(e) {}
            var dialog = new dialogViews.ShowNodeInfoDialog({
                node: this.node,
                clusterId: clusterId,
                configurationPossible: clusterId && !this.selectableForAddition && !this.selectableForDeletion,
                deployment: deployment
            });
            app.page.tab.registerSubView(dialog);
            dialog.render();
        },
        showRolesPanel: function() {
            this.$('.roles-panel').toggle();
        },
        updateProgress: function() {
            if (this.node.get('status') == 'provisioning' || this.node.get('status') == 'deploying') {
                var progress = this.node.get('progress') || 0;
                this.$('.bar').css('width', (progress > 3 ? progress : 3) + '%');
            }
        },
        updateStatus: function() {
            this.$('.node-status').html(this.nodeStatusTemplate({
                node: this.node,
                logsLink: this.getLogsLink()
            }));
            this.$('.node-box').toggleClass('node-offline', !this.node.get('online'));
            this.updateProgress();
        },
        getLogsLink: function() {
            var status = this.node.get('status');
            var error = this.node.get('error_type');
            var options = {type: 'remote', node: this.node.id};
            if (status == 'discover') {
                options.source = 'bootstrap/messages';
            } else if (status == 'provisioning' || status == 'provisioned' || (status == 'error' && error == 'provision')) {
                options.source = 'install/anaconda';
            } else if (status == 'deploying' || status == 'ready' || (status == 'error' && error == 'deploy')) {
                options.source = 'install/puppet';
            }
            return '#cluster/' + app.page.model.id + '/logs/' + utils.serializeTabOptions(options);
        },
        beforeTearDown: function() {
            $('html').off(this.eventNamespace);
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.renaming = false;
            this.selected = false;
            this.eventNamespace = 'click.editnodename' + this.node.id;
            this.node.on('change:name change:pending_addition change:pending_deletion change:online', this.render, this);
            this.node.on('change:status change:online', this.updateStatus, this);
            this.node.on('change:progress', this.updateProgress, this);
        },
        render: function() {
            this.tearDownRegisteredSubViews();
            this.$el.html(this.template({
                node: this.node,
                renaming: this.renaming,
                renameable: this.renameable,
                selected: this.selected
            }));
            var rolesPanel = new AssignRolesPanel({nodes: new models.Nodes(this.node)});
            this.registerSubView(rolesPanel);
            this.$el.append(rolesPanel.render().el);
            this.updateStatus();
            return this;
        }
    });

    EditNodeScreen = Screen.extend({
        constructorName: 'EditNodeScreen',
        keepScrollPosition: false,
        disableControls: function(disable) {
            this.$('.btn, input').attr('disabled', disable || this.isLocked());
        },
        returnToNodeList: function() {
            if (this.hasChanges()) {
                this.tab.page.discardSettingsChanges({cb: _.bind(this.goToNodeList, this)});
            } else {
                this.goToNodeList();
            }
        },
        isLocked: function() {
            return !!this.model.task('deploy', 'running');
        }
    });

    EditNodeDisksScreen = EditNodeScreen.extend({
        className: 'edit-node-disks-screen',
        constructorName: 'EditNodeDisksScreen',
        template: _.template(editNodeDisksScreenTemplate),
        events: {
            'click .btn-defaults': 'loadDefaults',
            'click .btn-revert-changes': 'revertChanges',
            'click .btn-apply:not(:disabled)': 'applyChanges',
            'click .btn-return:not(:disabled)': 'returnToNodeList'
        },
        hasChanges: function() {
            return !_.isEqual(this.disks.toJSON(), this.initialData);
        },
        hasValidationErrors: function() {
            var result = false;
            this.disks.each(function(disk) {result = result || _.some(disk.get('volumes').models, 'validationError');}, this);
            return result;
        },
        isLocked: function() {
            return !(this.node.get('pending_addition') || (this.node.get('status') == 'error' && this.node.get('error_type') == 'provision')) || this.constructor.__super__.isLocked.apply(this);
        },
        checkForChanges: function() {
            var hasChanges = this.hasChanges();
            var hasValidationErrors = this.hasValidationErrors();
            this.$('.btn-apply').attr('disabled', !hasChanges || hasValidationErrors);
            this.$('.btn-revert-changes').attr('disabled', !hasChanges && !hasValidationErrors);
            this.$('.btn-defaults').attr('disabled', false);
        },
        loadDefaults: function() {
            this.disableControls(true);
            this.disks.fetch({url: _.result(this.node, 'url') + '/disks/defaults/'})
                .fail(_.bind(function() {
                    utils.showErrorDialog({title: 'Node disks configuration'});
                }, this));
        },
        revertChanges: function() {
            this.disks.reset(_.cloneDeep(this.initialData), {parse: true});
        },
        applyChanges: function() {
            if (this.hasValidationErrors()) {
                return (new $.Deferred()).reject();
            }
            this.disableControls(true);
            return Backbone.sync('update', this.disks, {url: _.result(this.node, 'url') + '/disks'})
                .done(_.bind(function() {
                    this.model.fetch();
                    this.initialData = _.cloneDeep(this.disks.toJSON());
                    this.render();
                }, this))
                .fail(_.bind(function() {
                    this.checkForChanges();
                    utils.showErrorDialog({title: 'Node disks configuration'});
                }, this));
        },
        mapVolumesColors: function() {
            this.volumesColors = {};
            var colors = [
                ['#23a85e', '#1d8a4d'],
                ['#3582ce', '#2b6ba9'],
                ['#eea616', '#c38812'],
                ['#1cbbb4', '#189f99'],
                ['#9e0b0f', '#870a0d'],
                ['#8f50ca', '#7a44ac'],
                ['#1fa0e3', '#1b88c1'],
                ['#85c329', '#71a623'],
                ['#7d4900', '#6b3e00']
            ];
            this.volumes.each(function(volume, index) {
                this.volumesColors[volume.get('name')] = colors[index];
            }, this);
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.node = this.model.get('nodes').get(this.screenOptions[0]);
            if (this.node && this.node.get('role')) {
                this.model.on('change:status', this.revertChanges, this);
                this.volumes = new models.Volumes([], {url: _.result(this.node, 'url') + '/volumes'});
                this.disks = new models.Disks([], {url: _.result(this.node, 'url') + '/disks'});
                this.loading = $.when(this.node.fetch(), this.volumes.fetch(), this.disks.fetch())
                    .done(_.bind(function() {
                        this.initialData = _.cloneDeep(this.disks.toJSON());
                        this.mapVolumesColors();
                        this.render();
                        this.disks.on('sync', this.render, this);
                        this.disks.on('reset', this.render, this);
                        this.disks.on('error', this.checkForChanges, this);
                    }, this))
                    .fail(_.bind(this.goToNodeList, this));
            } else {
                this.goToNodeList();
            }
        },
        renderDisks: function() {
            this.tearDownRegisteredSubViews();
            this.$('.node-disks').html('');
            this.disks.each(function(disk) {
                var nodeDisk = new NodeDisk({
                    disk: disk,
                    diskMetaData: _.find(this.node.get('meta').disks, {disk: disk.id}),
                    screen: this
                });
                this.registerSubView(nodeDisk);
                this.$('.node-disks').append(nodeDisk.render().el);
            }, this);
        },
        render: function() {
            this.$el.html(this.template({
                node: this.node,
                locked: this.isLocked()
            }));
            if (this.loading && this.loading.state() != 'pending') {
                this.renderDisks();
                this.checkForChanges();
            }
            return this;
        }
    });

    NodeDisk = Backbone.View.extend({
        template: _.template(nodeDisksTemplate),
        volumeStylesTemplate: _.template(volumeStylesTemplate),
        templateHelpers: {
            sortEntryProperties: function(entry) {
                var properties = _.keys(entry);
                if (_.has(entry, 'name')) {
                    properties = ['name'].concat(_.keys(_.omit(entry, ['name'])));
                }
                return properties;
            },
            showDiskSize: utils.showDiskSize
        },
        events: {
            'click .toggle-volume': 'toggleEditDiskForm',
            'click .close-btn': 'deleteVolume',
            'keyup input': 'updateDisks',
            'click .use-all-allowed': 'useAllAllowedSpace'
        },
        toggleEditDiskForm: function(e) {
            if (this.screen.isLocked()) {return;}
            this.$('.disk-form').collapse('toggle');
            this.checkForGroupsDeletionAvailability();
        },
        getVolumeMinimum: function(name) {
            return this.screen.volumes.findWhere({name: name}).get('min_size');
        },
        checkForGroupsDeletionAvailability: function() {
            this.disk.get('volumes').each(function(volume) {
                var name = volume.get('name');
                this.$('.disk-visual .' + name + ' .close-btn').toggle(volume.getMinimalSize(this.getVolumeMinimum(name)) <= 0 && this.$('.disk-form').hasClass('in'));
            }, this);
        },
        validateVolume: function (volume) {
            var name = volume.get('name');
            volume.set({size: Number((this.$('input[name=' + name + ']').val()).replace(/,/g, ''))}, {validate: true, minimum: this.getVolumeMinimum(name)});
        },
        updateDisk: function() {
            this.$('.disk-visual').removeClass('invalid');
            this.$('input').removeClass('error').parents('.volume-group').next().text('');
            this.$('.volume-group-error-message.common').text('');
            this.disk.get('volumes').each(this.validateVolume, this); // volumes validation (minimum)
            this.disk.set({volumes: this.disk.get('volumes')}, {validate: true}); // disk validation (maximum)
            this.renderVisualGraph();
            this.checkForGroupsDeletionAvailability();
        },
        updateDisks: function(e) {
            this.updateDisk();
            _.invoke(_.omit(this.screen.subViews, this.cid), 'updateDisk', this);
            this.screen.checkForChanges();
        },
        deleteVolume: function(e) {
            this.$('input[name=' + this.$(e.currentTarget).parents('.volume-group').data('volume') + ']').val(0).trigger('keyup');
        },
        useAllAllowedSpace: function(e) {
            var volumeName = this.$(e.currentTarget).parents('.volume-group').data('volume');
            this.$('input[name=' + volumeName + ']').val(_.max([0, this.disk.getUnallocatedSpace({skip: volumeName})])).trigger('keyup');
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.disk.on('invalid', function(model, error) {
                this.$('.disk-visual').addClass('invalid');
                this.$('input').addClass('error');
                this.$('.volume-group-error-message.common').text(error);
            }, this);
            this.disk.get('volumes').each(function(volume) {
                volume.on('invalid', function(model, error) {
                    this.$('.disk-visual').addClass('invalid');
                    this.$('input[name=' + volume.get('name') + ']').addClass('error').parents('.volume-group').next().text(error);
                }, this);
            }, this);
        },
        renderVolume: function(name, width, size) {
            this.$('.disk-visual .' + name)
                .toggleClass('hidden-titles', width < 6)
                .css('width', width + '%')
                .find('.volume-group-size').text(utils.showDiskSize(size, 2));
        },
        renderVisualGraph: function() {
            if (!this.disk.get('volumes').some('validationError') && !this.disk.validationError) {
                var unallocatedWidth = 100;
                this.disk.get('volumes').each(function(volume) {
                    var width = this.disk.get('size') ? utils.floor(volume.get('size') / this.disk.get('size') * 100, 2) : 0;
                    unallocatedWidth -= width;
                    this.renderVolume(volume.get('name'), width, volume.get('size'));
                }, this);
                this.renderVolume('unallocated', unallocatedWidth, this.disk.getUnallocatedSpace());
            }
        },
        applyColors: function() {
            this.disk.get('volumes').each(function(volume) {
                var name = volume.get('name');
                var colors = this.screen.volumesColors[name];
                this.$('.disk-visual .' + name + ', .volume-group-box-flag.' + name).attr('style', this.volumeStylesTemplate({startColor: _.first(colors), endColor: _.last(colors)}));
            }, this);
        },
        render: function() {
            this.$el.html(this.template(_.extend({
                diskMetaData: this.diskMetaData,
                disk: this.disk,
                volumes: this.screen.volumes
            }, this.templateHelpers)));
            this.$('.disk-form').collapse({toggle: false});
            this.applyColors();
            this.renderVisualGraph();
            this.$('input').autoNumeric('init', {mDec: 0});
            return this;
        }
    });

    EditNodeInterfacesScreen = EditNodeScreen.extend({
        className: 'edit-node-networks-screen',
        constructorName: 'EditNodeInterfacesScreen',
        template: _.template(editNodeInterfacesScreenTemplate),
        events: {
            'click .btn-defaults': 'loadDefaults',
            'click .btn-revert-changes': 'revertChanges',
            'click .btn-apply:not(:disabled)': 'applyChanges',
            'click .btn-return:not(:disabled)': 'returnToNodeList'
        },
        hasChanges: function() {
            return !_.isEqual(this.interfaces.toJSON(), this.initialData);
        },
        isLocked: function() {
            return !(this.node.get('pending_addition') || this.model.get('status') == 'error') || this.constructor.__super__.isLocked.apply(this);
        },
        checkForChanges: function() {
            this.$('.btn-apply, .btn-revert-changes').attr('disabled', this.isLocked() || !this.hasChanges());
        },
        loadDefaults: function() {
            this.disableControls(true);
            this.interfaces.fetch({url: _.result(this.node, 'url') + '/interfaces/default_assignment', reset: true})
                .done(_.bind(function() {
                    this.disableControls(false);
                    this.checkForChanges();
                }, this))
                .fail(_.bind(function() {
                    this.disableControls(false);
                    utils.showErrorDialog({title: 'Unable to load default settings'});
                }, this));
        },
        revertChanges: function() {
            this.interfaces.reset(_.cloneDeep(this.initialData), {parse: true});
        },
        applyChanges: function() {
            this.disableControls(true);
            var configuration = new models.NodeInterfaceConfiguration({id: this.node.id, interfaces: this.interfaces});
            return Backbone.sync('update', new models.NodeInterfaceConfigurations(configuration))
                .done(_.bind(function() {
                    this.initialData = this.interfaces.toJSON();
                }, this))
                .fail(_.bind(function() {
                    var dialog = new dialogViews.Dialog();
                    app.page.registerSubView(dialog);
                    dialog.displayInfoMessage({error: true, title: 'Node network interfaces configuration error'});
                }, this))
                .always(_.bind(function() {
                    this.disableControls(false);
                    this.checkForChanges();
                }, this));
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.node = this.model.get('nodes').get(this.screenOptions[0]);
            if (this.node && this.node.get('role')) {
                this.model.on('change:status', function() {
                    this.revertChanges();
                    this.render();
                }, this);
                var networkConfiguration = new models.NetworkConfiguration();
                this.interfaces = new models.Interfaces();
                this.loading = $.when(
                   this.interfaces.fetch({url: _.result(this.node, 'url') + '/interfaces', reset: true}),
                   networkConfiguration.fetch({url: _.result(this.model, 'url') + '/network_configuration'})
                ).done(_.bind(function() {
                    // FIXME(vk): modifying models prototypes to use vlan data from NetworkConfiguration
                    // this mean that these models cannot be used safely in places other than this view
                    // helper function for template to get vlan_start NetworkConfiguration
                    models.InterfaceNetwork.prototype.vlanStart = function() {
                        return networkConfiguration.get('networks').findWhere({name: this.get('name')}).get('vlan_start');
                    };
                    models.InterfaceNetwork.prototype.amount = function() {
                        return networkConfiguration.get('networks').findWhere({name: this.get('name')}).get('amount');
                    };
                    this.initialData = this.interfaces.toJSON();
                    this.interfaces.on('reset', this.renderInterfaces, this);
                    this.interfaces.on('reset', this.checkForChanges, this);
                    this.checkForChanges();
                    this.renderInterfaces();
                }, this))
                .fail(_.bind(this.goToNodeList, this));
            } else {
                this.goToNodeList();
            }
        },
        renderInterfaces: function() {
            this.tearDownRegisteredSubViews();
            this.$('.node-networks').html('');
            this.interfaces.each(_.bind(function(ifc) {
                var nodeInterface = new NodeInterface({model: ifc, screen: this});
                this.registerSubView(nodeInterface);
                this.$('.node-networks').append(nodeInterface.render().el);
            }, this));
        },
        render: function() {
            this.$el.html(this.template({
                node: this.node,
                locked: this.isLocked()
            }));
            if (this.loading && this.loading.state() != 'pending') {
                this.renderInterfaces();
            }
            return this;
        }
    });

    NodeInterface = Backbone.View.extend({
        template: _.template(nodeInterfaceTemplate),
        templateHelpers: {
            showBandwidth: utils.showBandwidth
        },
        events: {
            'sortremove .logical-network-box': 'dragStart',
            'sortreceive .logical-network-box': 'dragStop',
            'sortstop .logical-network-box': 'dragStop'
        },
        dragStart: function(event, ui) {
            var networkNames = $(ui.item).find('.logical-network-item').map(function(index, el) {return $(el).data('name');}).get();
            var networks = this.model.get('assigned_networks').filter(function(network) {return _.contains(networkNames, network.get('name'));});
            this.model.get('assigned_networks').remove(networks);
            this.screen.draggedNetworks = networks;
        },
        dragStop: function(event, ui) {
            var networks = this.screen.draggedNetworks;
            if (event.type == 'sortreceive') {
                this.model.get('assigned_networks').add(networks);
            }
            this.render();
            this.screen.draggedNetworks = null;
        },
        checkIfEmpty: function() {
            this.$('.network-help-message').toggle(!this.model.get('assigned_networks').length && !this.screen.isLocked());
        },
        initialize: function(options) {
            _.defaults(this, options);
            this.model.get('assigned_networks').on('add remove', this.checkIfEmpty, this);
            this.model.get('assigned_networks').on('add remove', this.screen.checkForChanges, this.screen);
        },
        render: function() {
            this.$el.html(this.template(_.extend({ifc: this.model}, this.templateHelpers)));
            this.checkIfEmpty();
            this.$('.logical-network-box').sortable({
                connectWith: '.logical-network-box',
                items: '.logical-network-group',
                containment: this.screen.$('.node-networks'),
                disabled: this.screen.isLocked()
            }).disableSelection();
            return this;
        }
    });

    return NodesTab;
});
