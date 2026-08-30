import React from 'react';
import { getDashboardModel } from './dashboard-model';

export function IAC33Dashboard(){
  const model=getDashboardModel();
  return React.createElement('main',{className:'iac33-dashboard'},
    React.createElement('header',null,
      React.createElement('h1',null,'IAC33'),
      React.createElement('p',null,'Inteligencia · Análisis · C33')
    ),
    React.createElement('section',{className:'iac33-modules'},model.modules.map(m=>
      React.createElement('article',{key:m.id,className:'iac33-module'},
        React.createElement('h2',null,m.name),
        React.createElement('p',null,m.description)
      )
    )),
    React.createElement('section',{className:'iac33-status'},
      React.createElement('h2',null,'Conectores'),
      model.connectors.map(c=>React.createElement('div',{key:c.id},`${c.name}: ${c.enabled&&c.authorized?'disponible':'requiere autorización/conector'}`))
    )
  );
}
